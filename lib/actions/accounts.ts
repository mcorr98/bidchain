"use server";

import bcrypt from "bcrypt";
import pool from "@/lib/db";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { makeInvitationToken, hashToken, invitationExpiry } from "@/lib/invitations";
import { sendVendorActivationEmail } from "@/lib/email";
import { isActiveAgency } from "@/lib/permissions"; 

type RegistrationInviteRow = {
    purpose: string;
    email: string;
    accepted_at: Date | null;
    expires_at: Date;
};

export async function registerAccount(_previousState: unknown, formData: FormData) {

    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    const nextPath = formData.get("next");
    const passwordConfirm = formData.get("password_confirm");
    let role: "bidder" | "vendor" = "bidder";
    const inviteToken = formData.get("invite_token");

    if (typeof name !== "string" || name.trim() === "") {
        return { error: "Enter your name" };
    }
    if (typeof email !== "string" || email.trim() === "") {
        return { error: "Enter your email address" };
    }
    if (typeof password !== "string" || password.length < 8) {
        return { error: "Password must be at least 8 characters" };
    }
    if (passwordConfirm !== password) {
        return { error: "Passwords don't match" };
    }

    if (typeof inviteToken === "string" && inviteToken !== "") {
        const inviteResult = await pool.query<RegistrationInviteRow>(
            `SELECT purpose, email, accepted_at, expires_at FROM invitations WHERE token_hash = $1`,
            [hashToken(inviteToken)]
        );
        const invitation = inviteResult.rows[0];
        if (invitation === undefined || invitation.accepted_at !== null || invitation.expires_at < new Date()) {
            return { error: "Your invitation link is no longer valid - ask the property agent for a new one" };
        }
        if (invitation.email !== email) {
            return { error: "Register with the email address your invitation was sent to" };
        }
        if (invitation.purpose === "vendor_activation") {
            role = "vendor";
        }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const userResult = await client.query<{ user_id: number }>(
            `INSERT INTO users (email, password_hash, name, role)
            VALUES ($1, $2, $3, $4) RETURNING user_id`,
            [email, passwordHash, name, role]
        );

        if (role === "bidder") {
            await client.query(
                `INSERT INTO bidder_profiles (user_id) VALUES ($1)`,
                [userResult.rows[0].user_id]
            );
        }

        await client.query("COMMIT");

    } catch (error: unknown) {
        await client.query("ROLLBACK");
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
            return { error: "An account with that email already exists" };
        }
        console.error("registerAccount failed:", error);
        return { error: "Registration failed" };
    } finally {
        client.release();
    }

    let loginUrl = "/login";
    if (typeof nextPath === "string" && nextPath.startsWith("/")) {
        loginUrl = `/login?next=${encodeURIComponent(nextPath)}`;
    }
    redirect(loginUrl);
}

export async function inviteVendor(_previousState: unknown, formData: FormData) {

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    if (session.user.role !== "agent") {
        return { error: "Only agents can invite vendors" };
    }
    const agentId = Number(session.user.id);

    if (!(await isActiveAgency(agentId))) {
        return { error: "Your agency account has not been activated" };
    }

    const vendorEmail = formData.get("email");
    if (typeof vendorEmail !== "string" || vendorEmail.trim() === "") {
        return { error: "Enter the vendor's email address" };
    }

    const existing = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE email = $1`,
        [vendorEmail]
    );
    if (existing.rowCount !== null && existing.rowCount > 0) {
        if (existing.rows[0].role === "vendor") {
            return { error: "That email already has a vendor account: use it directly when creating the listing" };
        }
        return { error: "That email is already registered as a " + existing.rows[0].role + " account" };
    }

    const token = makeInvitationToken();
    const tokenHash = hashToken(token);
    const expiryDate = invitationExpiry();

    await pool.query(
        `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
         VALUES ($1, $2, 'vendor_activation', NULL, $3, $4)`,
        [tokenHash, vendorEmail, agentId, expiryDate]
    );

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
    const emailed = await sendVendorActivationEmail(vendorEmail, link);

    return { success: true, emailed, email: vendorEmail };
}
