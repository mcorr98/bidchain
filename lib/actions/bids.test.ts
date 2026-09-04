import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));

import pool from "@/lib/db";
import { auth } from "@/auth";
import { placeBid } from "@/lib/actions/bids";
import { EventRow, verifyChain } from "@/lib/chain";

let agentId: number;
let bidderId: number;
let outsiderId: number;
let propertyId: number;

function signInAs(userId: number): void {
    vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), role: "bidder", email: "bid.bidder@bidchain.test" } } as never);
}

function bidForm(pounds: number, position: string, funding: string): FormData {
    const form = new FormData();
    form.set("amount", String(pounds));
    form.set("buyer_position", position);
    form.set("funding", funding);
    return form;
}

import { appendEvent } from "@/lib/events";

async function writeGenesis(targetPropertyId: number): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SELECT property_id FROM properties WHERE property_id = $1 FOR UPDATE`, [targetPropertyId]);
        await appendEvent({
            client: client,
            propertyId: targetPropertyId,
            eventType: "LISTING_CREATED",
            actorId: agentId,
            details: { asking_price_snapshot: 25000000 },
        });
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

beforeAll(async () => {
    const agent = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('bid.agent@bidchain.test', 'x', 'Bid Agent', 'agent')
        ON CONFLICT (email) DO UPDATE SET name = 'Bid Agent' RETURNING user_id`
    );
    agentId = agent.rows[0].user_id;
    await pool.query(
        `INSERT INTO agent_profiles (user_id, agency_name, activation_status) VALUES ($1, 'Bid Agency', 'active')
        ON CONFLICT (user_id) DO NOTHING`, [agentId]
    );
    const bidder = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('bid.bidder@bidchain.test', 'x', 'Bid Bidder', 'bidder')
        ON CONFLICT (email) DO UPDATE SET name = 'Bid Bidder' RETURNING user_id`
    );
    bidderId = bidder.rows[0].user_id;
    await pool.query(
        `INSERT INTO bidder_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [bidderId]
    );
    await pool.query(
        `INSERT INTO bidder_verifications (bidder_id, agency_id, status, document_hash) VALUES ($1, $2, 'verified', 'h1')
        ON CONFLICT (bidder_id, agency_id) DO NOTHING`, [bidderId, agentId]
    );
    const outsider = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('bid.outsider@bidchain.test', 'x', 'Outsider', 'bidder')
        ON CONFLICT (email) DO UPDATE SET name = 'Outsider' RETURNING user_id`
    );
    outsiderId = outsider.rows[0].user_id;
    await pool.query(
        `INSERT INTO bidder_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [outsiderId]
    );
});

beforeEach(async () => {
    if (propertyId !== undefined) {
        await pool.query(`DELETE FROM events WHERE property_id = $1`, [propertyId]);
        await pool.query(`DELETE FROM offers WHERE property_id = $1`, [propertyId]);
        await pool.query(`DELETE FROM property_participants WHERE property_id = $1`, [propertyId]);
        await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    }
    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '4 Bid Row', 'Belfast', 'BT4 4DD', 25000000, 'offers_over', 'active', 'open') RETURNING property_id`,
        [agentId]
    );
    propertyId = property.rows[0].property_id;
    await pool.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by) VALUES ($1, $2, 'joined', $3)`,
        [propertyId, bidderId, agentId]
    );
    await writeGenesis(propertyId);
});

afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM offers WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM property_participants WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM bidder_verifications WHERE agency_id = $1`, [agentId]);
    await pool.query(`DELETE FROM bidder_profiles WHERE user_id IN ($1, $2)`, [bidderId, outsiderId]);
    await pool.query(`DELETE FROM agent_profiles WHERE user_id = $1`, [agentId]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'bid.%@bidchain.test'`);
    await pool.end();
});

describe("placeBid guards", () => {
    test("a non-participant is refused even though verified elsewhere", async () => {
        signInAs(outsiderId);
        const result = await placeBid(propertyId, null, bidForm(260000, "ftb", "mortgage"));
        expect(result).toHaveProperty("error");
    });

    test("a bid on a non-open property is refused", async () => {
        await pool.query(`UPDATE properties SET state = 'closed' WHERE property_id = $1`, [propertyId]);
        signInAs(bidderId);
        const result = await placeBid(propertyId, null, bidForm(260000, "ftb", "mortgage"));
        expect(result).toHaveProperty("error");
    });

    test("position and funding must come from the declared vocabulary", async () => {
        signInAs(bidderId);
        expect(await placeBid(propertyId, null, bidForm(260000, "investor", "mortgage"))).toHaveProperty("error");
        expect(await placeBid(propertyId, null, bidForm(260000, "ftb", "magic_beans"))).toHaveProperty("error");
    });
});

describe("placeBid happy path", () => {
    test("a valid bid writes the offer and a chained event with terms snapshotted", async () => {
        signInAs(bidderId);
        const result = await placeBid(propertyId, null, bidForm(260000, "ftb", "mortgage"));
        expect(result).toHaveProperty("success");

        const offers = await pool.query(`SELECT * FROM offers WHERE property_id = $1`, [propertyId]);
        expect(offers.rows.length).toBe(1);
        expect(offers.rows[0].current_amount).toBe(26000000);

        const events = await pool.query<EventRow>(`SELECT * FROM events WHERE property_id = $1 ORDER BY sequence`, [propertyId]);
        expect(events.rows.length).toBe(2);
        expect(events.rows[1].event_type).toBe("BID_PLACED");
        expect(events.rows[1].details).toMatchObject({ amount: 26000000, buyer_position: "ftb", funding: "mortgage" });
        expect(verifyChain(events.rows).valid).toBe(true);

        const profile = await pool.query<{ buyer_position: string }>(
            `SELECT buyer_position FROM bidder_profiles WHERE user_id = $1`,
            [bidderId]
        );
        expect(profile.rows[0].buyer_position).toBe("ftb");
    });

    test("Co-Ownership is a first-class funding method", async () => {
        signInAs(bidderId);
        const result = await placeBid(propertyId, null, bidForm(260000, "ftb", "co_ownership"));
        expect(result).toHaveProperty("success");
    });
});