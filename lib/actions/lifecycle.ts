"use server"
import { auth } from "@/auth";
import { canManageProperty } from "@/lib/permissions";
import pool from "@/lib/db";
import { GENESIS_HASH, makeNonce, EventPreimage, hashEvent } from "@/lib/chain";
import { revalidatePath } from "next/cache";
import { BiddingState } from "@/lib/types";

export async function closeBidding(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();
    const userId = Number(session?.user.id);

    if (session?.user.role !== "agent") {
        return { error: "Only agents can close bidding." }
    }

    if (!(await canManageProperty(propertyId, userId))) {
        return { error: "You don't manage this property." }
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "open") {
            await client.query("ROLLBACK");
            return { error: "Bidding is not currently open" };
        }
        const tail = await client.query(
            `SELECT sequence, hash
            FROM events
            WHERE property_id = $1
            ORDER BY sequence DESC
            LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;

        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {}
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "BIDDING_CLOSED",
            actor_id: userId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);
        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, preimage.event_type, userId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE properties SET state = $1 WHERE property_id = $2`,
            ["closed", propertyId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("closeBidding transaction failed:", err)
        await client.query("ROLLBACK");
        return { error: "Something went wrong when closing bidding" }
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}