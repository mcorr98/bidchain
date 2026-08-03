"use server";
import pool from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canBidOn } from "@/lib/permissions";
import { hashEvent, makeNonce, GENESIS_HASH, EventPreimage } from "@/lib/chain";
import { BiddingState } from "@/lib/types";

/**
 * Places a bid on a property. Writes to the chain only after input passes through validation stack:
 * 1. Session authenticated 
 * 2. Role is a "bidder" 
 * 3. Property exists and has an "open" state 
 * 4. Bidder is a joined participant on this property
 * 5. Amount is a positive whole number of pounds 
 * 
 * Amounts are entered in pounds and stored as integer pence.
 * Empty conditions are normalised to NULL
 * 
 * @param propertyId - target property
 * @param formData - amount (pounds) and optional conditions
 * @returns - { error: string } on failed checks, { success: true } on db insert
 */
export async function placeBid(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    if (session.user.role !== "bidder") {
        return { error: "Only 'bidder' users can place bids on a property" };
    }

    const bidderId = Number(session.user.id);

    const property = await pool.query(`SELECT property_id, state FROM properties WHERE properties.property_id = $1`, [propertyId]);

    if (property.rowCount === 0 || property.rows[0].state !== "open") {
        return { error: "This property is not currently accepting bids" };

    }

    if (!(await canBidOn(propertyId, bidderId))) {
        return { error: "You're not able to bid on this property" };
    }

    const pounds = Number(formData.get("amount"));

    if (Number.isNaN(pounds)) {
        return { error: "Enter a valid amount" };
    }

    if (pounds <= 0) {
        return { error: "Enter a valid amount" };
    }

    if (!Number.isInteger(pounds)) {
        return { error: "Enter a whole pounds number" }
    }

    const amountPence = pounds * 100;

    const conditionsRaw = formData.get("conditions");

    let conditions: string | null;
    if (typeof conditionsRaw === "string" && conditionsRaw !== "") {
        conditions = conditionsRaw;
    } else {
        conditions = null;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(`SELECT property_id FROM properties WHERE property_id = $1 FOR UPDATE`, [propertyId]);

        const tail = await client.query(
            `SELECT sequence, hash
            FROM events
            WHERE property_id = $1
            ORDER BY sequence DESC
            LIMIT 1`,
            [propertyId]
        );

        const offerInsert = await client.query(`INSERT INTO offers (property_id, bidder_id, current_amount, conditions, status, last_affirmed_at)
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING offer_id`,
            [propertyId, bidderId, amountPence, conditions, "active", null]
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
        const details = {
            amount: amountPence,
            offer_id: offerInsert.rows[0].offer_id,
            conditions: conditions,
        }
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "BID_PLACED",
            actor_id: bidderId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);
        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, preimage.event_type, bidderId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("placeBid transaction failed:", err)
        await client.query("ROLLBACK");
        return { error: "Something went wrong placing your bid" }
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}

/**
 * Withdraws a bidder's own offer. Appends BID_WITHDRAWN to the chain and marks the offer withdrawn
 */
export async function withdrawBid(propertyId: number, offerId: number, _previousState: unknown, formData: FormData) {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    if (session.user.role !== "bidder") {
        return { error: "Only bidders can withdraw an offer" };
    }

    const bidderId = Number(session.user.id);

    const reasonRaw = formData.get("reason");
    let reason: string | null;
    if (typeof reasonRaw === "string" && reasonRaw !== "") {
        reason = reasonRaw;
    } else {
        reason = null;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "open" && locked.rows[0].state !== "closed") {
            await client.query("ROLLBACK");
            return { error: "Offers can no longer be withdrawn on this property" };
        }


        const offerCheck = await client.query<{ current_amount: number }>(
            `SELECT current_amount FROM offers
             WHERE offer_id = $1 AND property_id = $2 AND bidder_id = $3 AND status = $4`,
            [offerId, propertyId, bidderId, "active"]
        );

        if (offerCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "Unable to withdraw: that offer wasn't found" };
        }

        const tail = await client.query(
            `SELECT sequence, hash FROM events
             WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
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
        const details = {
            offer_id: offerId,
            amount: offerCheck.rows[0].current_amount,
            reason: reason,
        };
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "BID_WITHDRAWN",
            actor_id: bidderId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, "BID_WITHDRAWN", bidderId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE offers SET status = $1, updated_at = NOW() WHERE offer_id = $2`,
            ["withdrawn", offerId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("withdrawBid transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong withdrawing the offer" };
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}