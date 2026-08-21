"use server";
import bcrypt from "bcrypt";
import pool from "@/lib/db";
import { redirect } from "next/navigation";
import { hashToken } from "@/lib/invitations";
import { standardiseEmail } from "@/lib/format";
import { auth, signOut } from "@/auth";


type RegistrationInviteRow = {
    purpose: string;
    email: string;
    accepted_at: Date | null;
    expires_at: Date;
};

export async function registerAccount(_previousState: unknown, formData: FormData) {

    const name = formData.get("name");
    const emailRaw = formData.get("email");
    const password = formData.get("password");
    const nextPath = formData.get("next");
    const passwordConfirm = formData.get("password_confirm");
    let role: "bidder" | "vendor" = "bidder";
    const inviteToken = formData.get("invite_token");

    if (typeof name !== "string" || name.trim() === "") {
        return { error: "Enter your name" };
    }
    if (typeof emailRaw !== "string" || emailRaw.trim() === "") {
        return { error: "Enter your email address" };
    }

    const email = standardiseEmail(emailRaw);

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

export async function changePassword(_previousState: unknown, formData: FormData) {

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    const userId = Number(session.user.id);

    const currentPassword = formData.get("current_password");
    const newPassword = formData.get("new_password");
    const confirmPassword = formData.get("confirm_password");

    if (typeof currentPassword !== "string" || currentPassword === "") {
        return { error: "Enter your current password" };
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
        return { error: "New password must be at least 8 characters" };
    }
    if (confirmPassword !== newPassword) {
        return { error: "New passwords don't match" };
    }

    const userResult = await pool.query<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE user_id = $1`,
        [userId]
    );
    const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!valid) {
        return { error: "Current password is incorrect" };
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
        `UPDATE users SET password_hash = $1 WHERE user_id = $2`,
        [newHash, userId]
    );

    return { success: true };
}

export async function changeEmail(_previousState: unknown, formData: FormData) {

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    const userId = Number(session.user.id);

    const newEmailRaw = formData.get("new_email");
    const currentPassword = formData.get("current_password");

    if (typeof newEmailRaw !== "string" || newEmailRaw.trim() === "" || !newEmailRaw.includes("@")) {
        return { error: "Enter a valid email address" };
    }
    const newEmail = standardiseEmail(newEmailRaw);

    if (typeof currentPassword !== "string" || currentPassword === "") {
        return { error: "Enter your current password to confirm the change" };
    }

    const userResult = await pool.query<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE user_id = $1`,
        [userId]
    );
    const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!valid) {
        return { error: "Password is incorrect" };
    }

    try {
        await pool.query(
            `UPDATE users SET email = $1 WHERE user_id = $2`,
            [newEmail, userId]
        );
    } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
            return { error: "An account with that email email address already exists" };
        }
        console.error("changeEmail failed:", error);
        return { error: "Something went wrong with updating your email address" };
    }

    await signOut({ redirectTo: "/login" });
}