"use server";

import bcrypt from "bcrypt";
import pool from "@/lib/db";
import { redirect } from "next/navigation";

export async function registerBidder(_previousState: unknown, formData: FormData) {

    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    const nextPath = formData.get("next");

    if (typeof name !== "string" || name.trim() === "") {
        return { error: "Enter your name" };
    }
    if (typeof email !== "string" || email.trim() === "") {
        return { error: "Enter your email address" };
    }
    if (typeof password !== "string" || password.length < 8) {
        return { error: "Password must be at least 8 characters" };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const userResult = await client.query<{ user_id: number }>(
            `INSERT INTO users (email, password_hash, name, role)
            VALUES ($1, $2, $3, 'bidder') RETURNING user_id`,
            [email, passwordHash, name]
        );

        await client.query(
            `INSERT INTO bidder_profiles (user_id) VALUES ($1)`,
            [userResult.rows[0].user_id]
        );

        await client.query("COMMIT");

    } catch (error: unknown) {
        await client.query("ROLLBACK");
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
            return { error: "An account with that email already exists" };
        }
        console.error("registerBidder failed:", error);
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