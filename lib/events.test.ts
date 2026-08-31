import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import pool from "./db";
import { appendEvent } from "./events";
import { EventRow, GENESIS_HASH, verifyChain } from "./chain";

let agentId: number;
let propertyId: number;

async function appendInTransaction(eventType: string, details: object): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SELECT property_id FROM properties WHERE property_id = $1 FOR UPDATE`, [propertyId]);
        await appendEvent({
            client: client,
            propertyId: propertyId,
            eventType: eventType as never,
            actorId: agentId,
            details: details as never,
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
    const user = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role)
        VALUES ('events.test@bidchain.test', 'x', 'Test Agent', 'agent')
        ON CONFLICT (email) DO UPDATE SET name = 'Test Agent'
        RETURNING user_id`
    );
    agentId = user.rows[0].user_id;
    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '1 Test Street', 'Belfast', 'BT1 1AA', 20000000, 'offers_over', 'active', 'open')
        RETURNING property_id`,
        [agentId]
    );
    propertyId = property.rows[0].property_id;
});

beforeEach(async () => {
    await pool.query(`DELETE FROM events WHERE property_id = $1`, [propertyId]);
});

afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    await pool.end();
});

describe("appendEvent", () => {
    test("an empty chain gets genesis: sequence 1 chained to the zero hash", async () => {
        await appendInTransaction("LISTING_CREATED", { asking_price_snapshot: 20000000 });
        const rows = await pool.query<EventRow>(
            `SELECT * FROM events WHERE property_id = $1 ORDER BY sequence`, [propertyId]
        );
        expect(rows.rows.length).toBe(1);
        expect(rows.rows[0].sequence).toBe(1);
        expect(rows.rows[0].prev_hash).toBe(GENESIS_HASH);
    });

    test("each append chains to the previous event's hash", async () => {
        await appendInTransaction("LISTING_CREATED", {});
        await appendInTransaction("BID_PLACED", { amount: 20500000 });
        await appendInTransaction("BIDDING_CLOSED", {});
        const rows = await pool.query<EventRow>(
            `SELECT * FROM events WHERE property_id = $1 ORDER BY sequence`, [propertyId]
        );
        expect(rows.rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
        expect(rows.rows[1].prev_hash).toBe(rows.rows[0].hash);
        expect(rows.rows[2].prev_hash).toBe(rows.rows[1].hash);
    });

    test("what appendEvent writes, verifyChain accepts", async () => {
        await appendInTransaction("LISTING_CREATED", { asking_price_snapshot: 20000000 });
        await appendInTransaction("BID_PLACED", { amount: 21000000, buyer_position: "ftb", funding: "mortgage" });
        const rows = await pool.query<EventRow>(
            `SELECT * FROM events WHERE property_id = $1 ORDER BY sequence`, [propertyId]
        );
        const verdict = verifyChain(rows.rows);
        expect(verdict.valid).toBe(true);
        expect(verdict.eventCount).toBe(2);
    });

    test("a tampered stored event is caught by verification", async () => {
        await appendInTransaction("LISTING_CREATED", {});
        await appendInTransaction("BID_PLACED", { amount: 21000000 });
        await pool.query(
            `UPDATE events SET canonical_details = '{"amount":99999999}' WHERE property_id = $1 AND sequence = 2`,
            [propertyId]
        );
        const rows = await pool.query<EventRow>(
            `SELECT * FROM events WHERE property_id = $1 ORDER BY sequence`, [propertyId]
        );
        expect(verifyChain(rows.rows).valid).toBe(false);
    });

    test("appendEvent refuses a semantically illegal event", async () => {
        await appendInTransaction("LISTING_CREATED", {});
        await expect(appendInTransaction("SALE_COMPLETED", {})).rejects.toThrow("Illegal event");
    });
});