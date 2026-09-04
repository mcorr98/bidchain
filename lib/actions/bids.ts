"use server";
import pool from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canBidOn, hasBidderProfile } from "@/lib/permissions";
import { EventType, JsonValue } from "@/lib/chain";
import { BiddingState } from "@/lib/types";
import { appendEvent } from "@/lib/events";
import { sendBidReceiptEmail } from "@/lib/email";
import { buildSignedReceipt } from "@/lib/receipts";

/**
 * Places a bid on a property. Writes to the chain only after input passes through validation stack:
 * 1. Session authenticated 
 * 2. Role is a "bidder" 
 * 3. Property exists and has an "open" state 
 * 4. Bidder is a joined participant on this property
 * 5. Amount is a positive whole number of pounds 
 * 
 * Amounts are entered in pounds and stored as integer pence.
 * Position, funding and condition flags must come from the declared vocabularies.
 * Empty conditions are normalised to NULL.
 * The bidder's declared position is written back to their profile.
 * After commit a signed receipt is emailed to the bidder, fail-soft.
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
    const bidderId = Number(session.user.id);

    if (!(await hasBidderProfile(bidderId))) {
        return { error: "Only verified bidders can place bids on a property" };
    }

    const property = await pool.query(`SELECT property_id, state, address_line_1, city FROM properties WHERE properties.property_id = $1`, [propertyId]);

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

    const positionRaw = formData.get("buyer_position");
    let buyerPosition: string;
    if (positionRaw === "ftb" || positionRaw === "chain" || positionRaw === "no_chain") {
        buyerPosition = positionRaw;
    } else {
        return { error: "Select your position" };
    }

    const fundingRaw = formData.get("funding");
    let funding: string;
    if (fundingRaw === "cash" || fundingRaw === "mortgage" || fundingRaw === "co_ownership") {
        funding = fundingRaw;
    } else {
        return { error: "Select the purchase's funding method" };
    }

    const ALLOWED_FLAGS = ["subject_to_survey", "flexible_completion"];
    const FLAG_LABELS: Record<string, string> = {
        subject_to_survey: "Subject to survey",
        flexible_completion: "Flexible on completion date",
    };
    const flagsRaw = formData.getAll("condition_flags");
    const conditionFlags: string[] = [];
    for (const flag of flagsRaw) {
        if (typeof flag === "string" && ALLOWED_FLAGS.includes(flag) && !conditionFlags.includes(flag)) {
            conditionFlags.push(flag);
        }
    }

    const noteRaw = formData.get("note");
    let note: string | null = null;
    if (typeof noteRaw === "string" && noteRaw !== "") {
        note = noteRaw;
    }

    // Summary as structured fields for the details field in the event
    const summaryParts = conditionFlags.map((flag) => FLAG_LABELS[flag]);
    if (note !== null) {
        summaryParts.push(note);
    }
    let conditions: string | null = null;
    if (summaryParts.length > 0) {
        conditions = summaryParts.join("; ");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(`SELECT property_id FROM properties WHERE property_id = $1 FOR UPDATE`, [propertyId]);

        const existingOffer = await client.query<{ offer_id: number; current_amount: number }>(
            `SELECT offer_id, current_amount FROM offers
            WHERE property_id = $1 AND bidder_id = $2 AND status = $3`,
            [propertyId, bidderId, "active"]
        );

        let offerId: number;
        let eventType: EventType;
        let details: JsonValue;

        if (existingOffer.rows.length === 0) {
            const insert = await client.query<{ offer_id: number }>(
                `INSERT INTO offers (property_id, bidder_id, current_amount, conditions, buyer_position, funding, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'active')
                RETURNING offer_id`,
                [propertyId, bidderId, amountPence, conditions, buyerPosition, funding]
            );

            offerId = insert.rows[0].offer_id;
            eventType = "BID_PLACED";
            details = { offer_id: offerId, amount: amountPence, conditions, condition_flags: conditionFlags, note: note, buyer_position: buyerPosition, funding: funding };

        } else {
            const previous = existingOffer.rows[0];
            offerId = previous.offer_id;

            await client.query(
                `UPDATE offers SET current_amount = $1, conditions = $2, buyer_position = $3, funding = $4, updated_at = NOW()
                WHERE offer_id = $5`,
                [amountPence, conditions, buyerPosition, funding, offerId]
            );

            eventType = "BID_REVISED";
            details = {
                offer_id: offerId,
                old_amount: previous.current_amount,
                new_amount: amountPence,
                conditions,
                condition_flags: conditionFlags,
                note: note,
                buyer_position: buyerPosition,
                funding: funding
            };
        }

        await client.query(
            `UPDATE bidder_profiles SET buyer_position = $1 WHERE user_id = $2`,
            [buyerPosition, bidderId]
        );

        await appendEvent({
            client: client,
            propertyId: propertyId,
            eventType: eventType,
            actorId: bidderId,
            details: details
        });

        await client.query("COMMIT");

    } catch (err) {
        console.error("placeBid transaction failed:", err)
        await client.query("ROLLBACK");
        return { error: "Something went wrong placing your bid" }
    } finally {
        client.release();
    }

    if (typeof session.user.email === "string" && session.user.email !== "") {
        const receipt = await buildSignedReceipt(propertyId);
        if (receipt !== null) {
            const address = property.rows[0].address_line_1 + ", " + property.rows[0].city;
            await sendBidReceiptEmail(
                session.user.email,
                address,
                JSON.stringify(receipt, null, 2),
                `bidchain-receipt-property-${propertyId}-seq-${receipt.record.tail_sequence}.json`
            );
        }
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

    const bidderId = Number(session.user.id);


    if (!(await hasBidderProfile(bidderId))) {
        return { error: "Only verified bidders can withdraw an offer" };
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



        const details = {
            offer_id: offerId,
            amount: offerCheck.rows[0].current_amount,
        };

        await appendEvent({
            client: client,
            propertyId: propertyId,
            eventType: "BID_WITHDRAWN",
            actorId: bidderId,
            details: details,
        });

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