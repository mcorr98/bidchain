import { NextResponse } from "next/server";
import pool from '@/lib/db';

/**
 * Health check endpoint. Confirms the app can reach the database.
 */
export async function GET() {
    try {
        const result = await pool.query('SELECT NOW()');
        return NextResponse.json({ status: 'ok', time: result.rows[0].now });
    } catch (error) {
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}