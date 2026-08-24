import pool from "@/lib/db";
import { auth } from "@/auth";
import { canManageProperty, isPropertyVendor } from "@/lib/permissions";
import { EventRow, verifyChain } from "@/lib/chain";

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

    // Full-record export is for the disclosure holders only: the canonical
    // bytes necessarily contain private offer terms, so bidders receive the receipt
    // (a verifiable commitment) rather than the record itself.
    const userId = Number(session.user.id);
    const isManaging = await canManageProperty(id, userId);
    const isVendor = await isPropertyVendor(id, userId);
    if (!isManaging && !isVendor) {
        return new Response("Forbidden", { status: 403 });
    }

    const eventsResult = await pool.query<EventRow>(
        `SELECT e.property_id, e.sequence, e.event_type, e.actor_id, e.timestamp, e.details, e.canonical_details, e.nonce, e.hash, e.prev_hash
        FROM events e
        WHERE e.property_id = $1
        ORDER BY e.sequence ASC`,
        [id]
    );
    if (eventsResult.rows.length === 0) {
        return new Response("Not found", { status: 404 });
    }
    const verification = verifyChain(eventsResult.rows);

    const record = {
        property_id: id,
        exported_at: new Date().toISOString(),
        verification: verification,
        note: "Each event's hash is SHA-256 over: property_id | sequence | event_type | actor_id | timestamp | canonical_details | nonce | prev_hash. Recompute from canonical_details to verify independently.",
        events: eventsResult.rows,
    };

    return new Response(JSON.stringify(record, null, 2), {
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="bidchain-record-property-${id}.json"`,
        },
    });
}