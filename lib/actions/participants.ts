"use server"
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import pool from "@/lib/db";
import { canManageProperty } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { makeInvitationToken, hashToken, invitationExpiry } from "@/lib/invitations";

type InvitationLockRow = {
    invitation_id: number;
    email: string;
    property_id: number | null;
    expires_at: Date;
    accepted_at: Date | null;
};

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

    const token = makeInvitationToken();
    const tokenHash = hashToken(token);
    const expiryDate = invitationExpiry();

    await pool.query(
        `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [tokenHash, invitedEmail, "bidder_invite", propertyId, userId, expiryDate]
    );

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

    revalidatePath(`/properties/${propertyId}`);
    return { success: true, link };
}

export async function acceptInvitation(token: string, _previousState: unknown, formData: FormData) {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    const userId = Number(session.user.id);
    const tokenHash = hashToken(token);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const result = await client.query<InvitationLockRow>(
            `SELECT invitation_id, email, property_id, expires_at, accepted_at
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
        if (invitation.email !== session.user.email) {
            await client.query("ROLLBACK");
            return { error: "This invitation was sent to a different email address." };
        }
        if (invitation.property_id === null) {
            await client.query("ROLLBACK");
            return { error: "This invitation isn't linked to an existing property." };
        }

        await client.query(
            `INSERT INTO property_participants (property_id, user_id, status, invited_by, joined_at)
        VALUES ($1, $2, 'joined', (SELECT created_by FROM invitations WHERE invitation_id = $3), NOW())
        ON CONFLICT (property_id, user_id) DO NOTHING`,
            [invitation.property_id, userId, invitation.invitation_id]
        );

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

    redirect("/properties");
}

