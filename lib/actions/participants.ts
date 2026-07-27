"use server"
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import pool from "@/lib/db";
import { canManageProperty } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function inviteBidder(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    const userId = Number(session.user.id);
    const invitedEmail = formData.get("email");

    if (session.user.role !== "agent") {
        return { error: "Only 'agent' users can invite participants to a property" };
    }

    if (typeof invitedEmail !== "string") {
        return { error: "Not a valid format for an email address" };
    }

    if (!(await canManageProperty(propertyId, userId))) {
        return { error: "Property not under the administration of this agent" };
    }

    const bidderDetails = await pool.query(
        `SELECT user_id, email FROM users WHERE email = $1 AND role = $2`,
        [invitedEmail, "bidder"]
    );

    if (bidderDetails.rowCount === null || bidderDetails.rowCount < 1) {
        return { error: "Unable to match invitee email to an existing bidder profile" }; //TODO: Expnd to invite new bidders 
    }

    const bidder = bidderDetails.rows[0];

    const existing = await pool.query(
        `SELECT participant_id FROM property_participants
     WHERE property_id = $1 AND user_id = $2`,
        [propertyId, bidder.user_id]
    );

    if (existing.rowCount !== null && existing.rowCount > 0) {
        return { error: "That bidder is already a participant on this property" };
    }
    await pool.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by)
        VALUES ($1, $2, $3, $4)`,
        [propertyId, bidder.user_id, "joined", userId]
    );

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}