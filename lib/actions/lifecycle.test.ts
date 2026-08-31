import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    redirect: vi.fn((url: string) => {
        throw new Error("REDIRECT:" + url);
    }),
}));

import pool from "@/lib/db";
import { auth } from "@/auth";
import { publishListing } from "@/lib/actions/lifecycle";
import { EventRow, GENESIS_HASH } from "@/lib/chain";

let agentId: number;
let vendorId: number;
let propertyId: number;

function signInAs(userId: number, role: string): void {
    vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), role: role } } as never);
}

beforeAll(async () => {
    const agent = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('act.agent@bidchain.test', 'x', 'Action Agent', 'agent')
        ON CONFLICT (email) DO UPDATE SET name = 'Action Agent' RETURNING user_id`
    );
    agentId = agent.rows[0].user_id;
    await pool.query(
        `INSERT INTO agent_profiles (user_id, agency_name, activation_status) VALUES ($1, 'Action Agency', 'active')
        ON CONFLICT (user_id) DO NOTHING`,
        [agentId]
    );
    const vendor = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('act.vendor@bidchain.test', 'x', 'Action Vendor', 'vendor')
        ON CONFLICT (email) DO UPDATE SET name = 'Action Vendor' RETURNING user_id`
    );
    vendorId = vendor.rows[0].user_id;
});

beforeEach(async () => {
    if (propertyId !== undefined) {
        await pool.query(`DELETE FROM events WHERE property_id = $1`, [propertyId]);
        await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    }
    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, vendor_id, address_line_1, city, postcode, asking_price, listing_type, listing_url, status, state)
        VALUES ($1, NULL, '3 Action Terrace', 'Belfast', 'BT3 3CC', 30000000, 'offers_over', 'https://example.com/listing', 'active', 'draft')
        RETURNING property_id`,
        [agentId]
    );
    propertyId = property.rows[0].property_id;
});

afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM agent_profiles WHERE user_id = $1`, [agentId]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'act.%@bidchain.test'`);
    await pool.end();
});

describe("publishListing", () => {
    test("refuses without an attached vendor: consent is the gate", async () => {
        signInAs(agentId, "agent");
        const result = await publishListing(propertyId, null, new FormData());
        expect(result).toHaveProperty("error");
        const events = await pool.query(`SELECT * FROM events WHERE property_id = $1`, [propertyId]);
        expect(events.rows.length).toBe(0);
    });

    test("refuses a non-agent even with a vendor attached", async () => {
        await pool.query(`UPDATE properties SET vendor_id = $1 WHERE property_id = $2`, [vendorId, propertyId]);
        signInAs(vendorId, "vendor");
        const result = await publishListing(propertyId, null, new FormData());
        expect(result).toHaveProperty("error");
    });

    test("publishes with vendor consent: genesis carries the snapshots", async () => {
        await pool.query(`UPDATE properties SET vendor_id = $1 WHERE property_id = $2`, [vendorId, propertyId]);
        signInAs(agentId, "agent");
        const result = await publishListing(propertyId, null, new FormData());
        expect(result).toHaveProperty("success");

        const events = await pool.query<EventRow>(`SELECT * FROM events WHERE property_id = $1`, [propertyId]);
        expect(events.rows.length).toBe(1);
        const genesis = events.rows[0];
        expect(genesis.sequence).toBe(1);
        expect(genesis.event_type).toBe("LISTING_CREATED");
        expect(genesis.prev_hash).toBe(GENESIS_HASH);
        expect(genesis.details).toMatchObject({
            asking_price_snapshot: 30000000,
            listing_type_snapshot: "offers_over",
            listing_url_snapshot: "https://example.com/listing",
        });

        const state = await pool.query<{ state: string }>(`SELECT state FROM properties WHERE property_id = $1`, [propertyId]);
        expect(state.rows[0].state).toBe("open");
    });

    test("publishing twice is refused: single genesis, ever", async () => {
        await pool.query(`UPDATE properties SET vendor_id = $1 WHERE property_id = $2`, [vendorId, propertyId]);
        signInAs(agentId, "agent");
        await publishListing(propertyId, null, new FormData());
        const second = await publishListing(propertyId, null, new FormData());
        expect(second).toHaveProperty("error");
        const events = await pool.query(`SELECT * FROM events WHERE property_id = $1`, [propertyId]);
        expect(events.rows.length).toBe(1);
    });
});