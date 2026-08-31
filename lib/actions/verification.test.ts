import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));

import pool from "@/lib/db";
import { auth } from "@/auth";
import { decideVerification } from "@/lib/actions/verification";

let agentId: number;
let bidderId: number;
let propertyId: number;

function decisionForm(decision: string, reviewedHash: string, reason?: string): FormData {
    const form = new FormData();
    form.set("decision", decision);
    form.set("reviewed_hash", reviewedHash);
    if (reason !== undefined) {
        form.set("reason", reason);
    }
    return form;
}

beforeAll(async () => {
    const agent = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('ver.agent@bidchain.test', 'x', 'Ver Agent', 'agent')
        ON CONFLICT (email) DO UPDATE SET name = 'Ver Agent' RETURNING user_id`
    );
    agentId = agent.rows[0].user_id;
    await pool.query(
        `INSERT INTO agent_profiles (user_id, agency_name, activation_status) VALUES ($1, 'Ver Agency', 'active')
        ON CONFLICT (user_id) DO NOTHING`, [agentId]
    );
    const bidder = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('ver.bidder@bidchain.test', 'x', 'Ver Bidder', 'bidder')
        ON CONFLICT (email) DO UPDATE SET name = 'Ver Bidder' RETURNING user_id`
    );
    bidderId = bidder.rows[0].user_id;
    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '5 Verify Way', 'Belfast', 'BT5 5EE', 18000000, 'offers_over', 'active', 'open') RETURNING property_id`,
        [agentId]
    );
    propertyId = property.rows[0].property_id;
    await pool.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by) VALUES ($1, $2, 'joined', $3)`,
        [propertyId, bidderId, agentId]
    );
    vi.mocked(auth).mockResolvedValue({ user: { id: String(agentId), role: "agent" } } as never);
});

beforeEach(async () => {
    await pool.query(`DELETE FROM bidder_verifications WHERE bidder_id = $1`, [bidderId]);
    await pool.query(
        `INSERT INTO bidder_profiles (user_id, id_document_path, id_document_hash)
        VALUES ($1, '/private/doc.jpg', 'current_hash_aaa')
        ON CONFLICT (user_id) DO UPDATE SET id_document_hash = 'current_hash_aaa'`,
        [bidderId]
    );
});

afterAll(async () => {
    await pool.query(`DELETE FROM bidder_verifications WHERE bidder_id = $1`, [bidderId]);
    await pool.query(`DELETE FROM property_participants WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM bidder_profiles WHERE user_id = $1`, [bidderId]);
    await pool.query(`DELETE FROM agent_profiles WHERE user_id = $1`, [agentId]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'ver.%@bidchain.test'`);
    await pool.end();
});

describe("decideVerification", () => {
    test("TOCTOU: a decision made against a replaced document is refused", async () => {
        const result = await decideVerification(bidderId, null, decisionForm("verified", "stale_hash_zzz"));
        expect(result).toHaveProperty("error");
        const rows = await pool.query(`SELECT * FROM bidder_verifications WHERE bidder_id = $1`, [bidderId]);
        expect(rows.rows.length).toBe(0);
    });

    test("a decision bound to the reviewed bytes is recorded with the hash snapshot", async () => {
        const result = await decideVerification(bidderId, null, decisionForm("verified", "current_hash_aaa"));
        expect(result).toHaveProperty("success");
        const rows = await pool.query<{ status: string; document_hash: string }>(
            `SELECT status, document_hash FROM bidder_verifications WHERE bidder_id = $1`, [bidderId]
        );
        expect(rows.rows[0].status).toBe("verified");
        expect(rows.rows[0].document_hash).toBe("current_hash_aaa");
    });

    test("a rejection without a reason is refused", async () => {
        const result = await decideVerification(bidderId, null, decisionForm("rejected", "current_hash_aaa"));
        expect(result).toHaveProperty("error");
    });

    test("an agent cannot decide for a bidder outside their listings", async () => {
        await pool.query(`DELETE FROM property_participants WHERE property_id = $1`, [propertyId]);
        const result = await decideVerification(bidderId, null, decisionForm("verified", "current_hash_aaa"));
        expect(result).toHaveProperty("error");
        await pool.query(
            `INSERT INTO property_participants (property_id, user_id, status, invited_by) VALUES ($1, $2, 'joined', $3)`,
            [propertyId, bidderId, agentId]
        );
    });
});