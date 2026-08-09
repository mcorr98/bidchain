import { auth } from "@/auth";
import pool from "@/lib/db";
import { canViewOffers } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
    const { propertyId } = await params;

    const session = await auth();
    if (!session || !session.user) {
        return new Response("Unauthorised", { status: 401 });
    }

    const id = Number(propertyId);
    if (!Number.isInteger(id) || id < 1) {
        return new Response("Not found", { status: 404 });
    }

    const allowed = await canViewOffers(id, Number(session.user.id));
    if (!allowed) {
        return new Response("Forbidden", { status: 403 });
    }

    const tailResult = await pool.query(
        `SELECT sequence, event_type, timestamp, hash
        FROM events
        WHERE property_id = $1
        ORDER BY sequence DESC
        LIMIT 1`,
        [id]
    );

    if (tailResult.rowCount === 0) {
        return new Response("Not found", { status: 404 });
    }
    const tail = tailResult.rows[0];

    // The tail hash represetns the entire history up until that point so anyone holding
    // the receipt can detect any later rewrite of that history.
    const receipt = {
        property_id: id,
        issued_at: new Date().toISOString(),
        tail_sequence: tail.sequence,
        tail_event_type: tail.event_type,
        tail_event_timestamp: tail.timestamp.toISOString(),
        tail_hash: tail.hash,
        note: "This is a encoded record of the full event history up to this point. Keep it - it can be used to detect any later changes to this history.",
    };

    return Response.json(receipt, {
        headers: {
            "Content-Disposition": `attachment; filename="bidchain-receipt-property-${id}-seq-${tail.sequence}.json"`,
        },
    });
}