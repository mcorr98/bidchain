import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import pool from "@/lib/db";
import { appendEvent } from "@/lib/events";
import { buildSignedReceipt } from "@/lib/receipts";

let agentId: number;
let propertyId: number;
let emptyPropertyId: number;

beforeAll(async () => {
    const agent = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('receipt.agent@bidchain.test', 'x', 'Receipt Agent', 'agent')
        ON CONFLICT (email) DO UPDATE SET name = 'Receipt Agent' RETURNING user_id`
    );
    agentId = agent.rows[0].user_id;

    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '9 Receipt Way', 'Belfast', 'BT9 9RR', 30000000, 'offers_over', 'active', 'open') RETURNING property_id`,
        [agentId]
    );
    propertyId = property.rows[0].property_id;

    const empty = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '11 Receipt Way', 'Belfast', 'BT9 9RR', 30000000, 'offers_over', 'draft', 'draft') RETURNING property_id`,
        [agentId]
    );
    emptyPropertyId = empty.rows[0].property_id;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SELECT property_id FROM properties WHERE property_id = $1 FOR UPDATE`, [propertyId]);
        await appendEvent({
            client: client,
            propertyId: propertyId,
            eventType: "LISTING_CREATED",
            actorId: agentId,
            details: { asking_price_snapshot: 30000000 },
        });
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
});

afterAll(async () => {
    await pool.query(`DELETE FROM events WHERE property_id IN ($1, $2)`, [propertyId, emptyPropertyId]);
    await pool.query(`DELETE FROM properties WHERE property_id IN ($1, $2)`, [propertyId, emptyPropertyId]);
    await pool.query(`DELETE FROM users WHERE email = 'receipt.agent@bidchain.test'`);
    await pool.end();
});

describe("buildSignedReceipt", () => {
    test("returns null for a property with no chain", async () => {
        expect(await buildSignedReceipt(emptyPropertyId)).toBeNull();
    });

    test("the receipt commits to the chain's actual tail", async () => {
        const receipt = await buildSignedReceipt(propertyId);
        expect(receipt).not.toBeNull();

        const tail = await pool.query<{ sequence: number; event_type: string; hash: string }>(
            `SELECT sequence, event_type, hash FROM events WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
            [propertyId]
        );
        expect(receipt!.record.tail_sequence).toBe(tail.rows[0].sequence);
        expect(receipt!.record.tail_event_type).toBe(tail.rows[0].event_type);
        expect(receipt!.record.tail_hash).toBe(tail.rows[0].hash);
    });

    test("the signature verifies over the record's exact JSON bytes, and fails after one byte changes", async () => {
        const receipt = await buildSignedReceipt(propertyId);
        expect(receipt).not.toBeNull();
        expect(receipt!.signature).not.toBeNull();

        const recordJson = JSON.stringify(receipt!.record);
        const publicKey = crypto.createPublicKey({
            key: Buffer.from(receipt!.signature!.public_key, "base64"),
            format: "der",
            type: "spki",
        });
        const signatureBytes = Buffer.from(receipt!.signature!.value, "base64");

        expect(crypto.verify(null, Buffer.from(recordJson, "utf8"), publicKey, signatureBytes)).toBe(true);

        const tampered = recordJson.replace(receipt!.record.tail_hash.slice(0, 8), "00000000");
        expect(crypto.verify(null, Buffer.from(tampered, "utf8"), publicKey, signatureBytes)).toBe(false);
    });
});