"use server";
import pool from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache"; 
import { canBidOn } from "@/lib/permissions";

/**
 * Places a bid on a property. Writes to the chain only after input passes through validation stack:
 * 1. Session authenticated 
 * 2. Role is a "bidder" 
 * 3. Property exists and has an "open" state 
 * 4. Bidder is an invited participant on this property
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

    let conditions = formData.get("conditions");

    if (conditions === "") {
        conditions = null;
    }

    const result = await pool.query(
        `INSERT INTO offers (property_id, bidder_id, current_amount, conditions)
     VALUES ($1, $2, $3, $4)
     RETURNING offer_id`,
        [propertyId, bidderId, amountPence, conditions]
    );

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}