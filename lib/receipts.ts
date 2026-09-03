import pool from "@/lib/db";
import { RecordSignature, signRecord } from "@/lib/signing";

type ReceiptTailRow = {
    sequence: number;
    event_type: string;
    timestamp: Date;
    hash: string;
};

export type SignedReceipt = {
    record: {
        property_id: number;
        issued_at: string;
        tail_sequence: number;
        tail_event_type: string;
        tail_event_timestamp: string;
        tail_hash: string;
        note: string;
    };
    signature: RecordSignature | null;
};

/**
 * Builds a signed receipt for a property's current chain tail, or null if
 * the property has no chain yet. The signature covers the exact JSON bytes
 * of the record field, matching the full-record export so the same
 * verification tooling works on both.
 */
export async function buildSignedReceipt(propertyId: number): Promise<SignedReceipt | null> {
    const tailResult = await pool.query<ReceiptTailRow>(
        `SELECT sequence, event_type, timestamp, hash FROM events
        WHERE property_id = $1
        ORDER BY sequence DESC
        LIMIT 1`,
        [propertyId]
    );
    if (tailResult.rowCount === 0) {
        return null;
    }
    const tail = tailResult.rows[0];
    const record = {
        property_id: propertyId,
        issued_at: new Date().toISOString(),
        tail_sequence: tail.sequence,
        tail_event_type: tail.event_type,
        tail_event_timestamp: tail.timestamp.toISOString(),
        tail_hash: tail.hash,
        note: "This is an encoded record of the full event history up to this point. Keep it - it can be used to detect any later changes to this history.",
    };
    return { record: record, signature: signRecord(JSON.stringify(record)) };
}