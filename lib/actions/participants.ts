"use server"
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import pool from "@/lib/db";
import { canManageProperty } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { makeInvitationToken, hashToken, invitationExpiry, invitationLink } from "@/lib/invitations";
import { sendBidderInviteEmail } from "@/lib/email";
import { standardiseEmail } from "@/lib/format";

type InvitationLockRow = {
    invitation_id: number;
    email: string;
    property_id: number | null;
    expires_at: Date;
    accepted_at: Date | null;
    created_by: number;
    purpose: string;
};

/**
 * Agent invites a bidder to a property by email. Stores only the token's
 * hash, records the invited participant, and emails the single-use link.
 * Invitations can only be sent while bidding is open.
 * @param propertyId - the property the bidder is invited to
 * @param formData - the invitee's email address
 * @returns - { error: string } on failed checks, success with email status otherwise
 */
export async function inviteBidder(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    const userId = Number(session.user.id);
    const invitedEmailRaw = formData.get("email");

    if (session.user.role !== "agent") {
        return { error: "Only an agent can invite participants to a property" };
    }

    if (typeof invitedEmailRaw !== "string") {
        return { error: "Not a valid format for an email address" };
    }

    const invitedEmail = standardiseEmail(invitedEmailRaw);

    if (!(await canManageProperty(propertyId, userId))) {
        return { error: "Property not under the administration of this agent" };
    }

    const propertyResult = await pool.query<{ state: string; address_line_1: string; city: string }>(
        `SELECT state, address_line_1, city FROM properties WHERE property_id = $1`,
        [propertyId]
    );
    if (propertyResult.rowCount === 0 || propertyResult.rows[0].state !== "open") {
        return { error: "Bidders can only be invited while bidding is open" };
    }
    const propertyAddress = propertyResult.rows[0].address_line_1 + ", " + propertyResult.rows[0].city;

    const token = makeInvitationToken();
    const tokenHash = hashToken(token);
    const expiryDate = invitationExpiry();

    await pool.query(
        `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [tokenHash, invitedEmail, "bidder_invite", propertyId, userId, expiryDate]
    );

    await pool.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by)
        SELECT $1, u.user_id, 'invited', $2
        FROM users u
        WHERE u.email = $3
        ON CONFLICT (property_id, user_id)
        DO UPDATE SET status = 'invited'
        WHERE property_participants.status = 'lapsed'`,
        [propertyId, userId, invitedEmail]
    );

    const link = invitationLink(token);

    const emailed = await sendBidderInviteEmail(invitedEmail, propertyAddress, link);

    revalidatePath(`/properties/${propertyId}`);
    return { success: true, emailed, email: invitedEmail };
}

/**
 * Redeems an invitation link. Validates the token against its stored hash,
 * refuses expired, cancelled, already-used or wrong-email tokens, then
 * joins the user to the property and marks the invitation accepted.
 * @param token - the plaintext token from the link
 * @returns - { error: string } on refusal, otherwise redirects into the property
 */
export async function acceptInvitation(token: string, _previousState: unknown, formData: FormData) {
    const session = await auth();
    let redirectPath = "/properties";

    if (!session) {
        redirect("/login");
    }

    const userId = Number(session.user.id);
    const tokenHash = hashToken(token);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const result = await client.query<InvitationLockRow>(
            `SELECT invitation_id, purpose, email, property_id, expires_at, accepted_at, created_by
            FROM invitations WHERE token_hash = $1 FOR UPDATE`,
            [tokenHash]
        );

        const invitation = result.rows[0];

        if (invitation === undefined) {
            await client.query("ROLLBACK");
            return { error: "This invitation link isn't valid." };
        }
        if (invitation.accepted_at !== null) {
            await client.query("ROLLBACK");
            return { error: "This invitation has already been used." };
        }
        if (invitation.expires_at < new Date()) {
            await client.query("ROLLBACK");
            return { error: "This invitation has expired." };
        }
        if (invitation.email !== standardiseEmail(session.user.email ?? "")) {
            await client.query("ROLLBACK");
            return { error: "This invitation was sent to a different email address." };
        }

        if (invitation.purpose === "bidder_invite") {
            if (invitation.property_id === null) {
                await client.query("ROLLBACK");
                return { error: "This invitation isn't linked to an existing property." };
            }

            await client.query(
                `INSERT INTO bidder_profiles (user_id) VALUES ($1)
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId]
            );

            await client.query(
                `INSERT INTO property_participants (property_id, user_id, status, invited_by, joined_at)
                VALUES ($1, $2, 'joined', $3, NOW())
                ON CONFLICT (property_id, user_id)
                DO UPDATE SET status = 'joined', joined_at = NOW()`,
                [invitation.property_id, userId, invitation.created_by]
            );
            redirectPath = "/properties";

        } else {
            if (session.user.role === "agent") {
                await client.query("ROLLBACK");
                return { error: "Agents cannot hold vendor accounts for their own listings." };
            }

            await client.query(
                `INSERT INTO vendor_profiles (user_id, created_by, activated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (user_id) DO NOTHING`,
                [userId, invitation.created_by]
            );
            redirectPath = "/properties";


            if (invitation.property_id !== null) {
                await client.query<{ state: string; asking_price: number; listing_type: string }>(
                    `UPDATE properties SET vendor_id = $1, updated_at = NOW()
                    WHERE property_id = $2 AND state = 'draft' AND vendor_id IS NULL`,
                    [userId, invitation.property_id]
                );
                redirectPath = `/properties/${invitation.property_id}`;
            }
        }

        await client.query(
            `UPDATE invitations SET accepted_at = NOW(), accepted_by = $1 WHERE invitation_id = $2`,
            [userId, invitation.invitation_id]
        );

        await client.query("COMMIT");
    } catch (err) {
        console.error("acceptInvitation transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong accepting the invitation" };
    } finally {
        client.release();
    }

    redirect(redirectPath);
}

/**
 * Cancels a pending invitation
 */
export async function cancelInvitation(propertyId: number, email: string, _previousState: unknown, formData: FormData) {

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    if (session.user.role !== "agent") {
        return { error: "Only agents can cancel invitations" };
    }
    const agentId = Number(session.user.id);

    if (!(await canManageProperty(propertyId, agentId))) {
        return { error: "Property not under the administration of this agent" };
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            `DELETE FROM invitations
            WHERE property_id = $1 AND email = $2
            AND purpose = 'bidder_invite' AND accepted_at IS NULL`,
            [propertyId, email]
        );

        await client.query(
            `DELETE FROM property_participants pp
            USING users u
            WHERE pp.user_id = u.user_id
            AND pp.property_id = $1 AND u.email = $2
            AND pp.status IN ('invited', 'lapsed')`,
            [propertyId, email]
        );

        await client.query("COMMIT");
    } catch (err) {
        console.error("cancelInvitation transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong cancelling the invitation" };
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}