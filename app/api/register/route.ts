import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import pool from "@/lib/db";

const VALID_ROLES = ["vendor", "bidder"];

export async function POST(request: Request) {
    const { email, password, name, role, agency_name } = await request.json();

    if (!email || !password || !name || !role) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userResult = await client.query(
            `INSERT INTO users(email, password_hash, name, role)
            VALUES ($1, $2, $3, $4) RETURNING user_id`,
            [email, password_hash, name, role]
        );
        const userId = userResult.rows[0].user_id;

        if (role === "bidder") {
            await client.query(
                `INSERT INTO bidder_profiles (user_id) VALUES ($1)`,
                [userId]
            );
        } else if (role === "vendor") {
            await client.query(
                `INSERT INTO vendor_profiles (user_id) VALUES ($1)`,
                [userId]
            );
        } else if (role === "agent") {
            await client.query(
                `INSERT INTO agent_profiles (user_id, agency_name) VALUES ($1, $2)`,
                [userId, agency_name ?? "Unknown"]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ id: userId }, { status: 201 });
    } catch (error: unknown) {
        await client.query("ROLLBACK");
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
            return NextResponse.json({ error: "Email already registered" }, { status: 409 })
        }
        return NextResponse.json({ error: "Registration failed" }, { status: 500 });
    } finally {
        client.release();
    }
}