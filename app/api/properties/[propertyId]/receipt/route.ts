import { auth } from "@/auth";
import { canViewOffers } from "@/lib/permissions";
import { buildSignedReceipt } from "@/lib/receipts";

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

    const receipt = await buildSignedReceipt(id);
    if (receipt === null) {
        return new Response("Not found", { status: 404 });
    }

    return Response.json(receipt, {
        headers: {
            "Content-Disposition": `attachment; filename="bidchain-receipt-property-${id}-seq-${receipt.record.tail_sequence}.json"`,
        },
    });
}