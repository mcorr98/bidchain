import pool from "@/lib/db";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { EventRow, verifyChain, Failure } from "@/lib/chain";
import { canViewOffers, canManageProperty, isPropertyVendor } from "@/lib/permissions";
import { makeParticipantLabel, buildBidderAliases } from "@/lib/bid_visibility_manager";
import { eventTypeLabel, formatPrice } from "@/lib/format";
import SectionHeading from "@/components/section-heading";
import { Link2, BadgeCheck, BadgeX } from "lucide-react";

type ChainRouteParams = {
    id: string;
};

type ChainPageProps = {
    params: Promise<ChainRouteParams>;
};

type ChainEventRow = EventRow & { actor_name: string };

type ChainPropertyRow = {
    address_line_1: string;
    city: string;
    agent_id: number;
    vendor_id: number | null;
    state: string;
};

const PUBLIC_DETAIL_KEYS = [
    "amount", "old_amount", "new_amount", "buyer_position", "funding",
    "asking_price_snapshot", "listing_type_snapshot",
    "previous_asking_price", "new_asking_price",
    "initiated_by", "reason", "offer_id", "failed_offer_id",
];
const TERMS_DETAIL_KEYS = ["conditions", "condition_flags", "note"];

export default async function ChainDetailsPage(props: ChainPageProps) {
    const params = await props.params;
    const propertyId = Number(params.id);
    if (!Number.isInteger(propertyId) || propertyId < 1) {
        notFound();
    }

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    const userId = Number(session.user.id);

    const propertyResult = await pool.query<ChainPropertyRow>(
        `SELECT address_line_1, city, agent_id, vendor_id, state FROM properties WHERE property_id = $1`,
        [propertyId]
    );
    const property = propertyResult.rows[0];
    if (property === undefined || property.state === "draft") {
        notFound();
    }

    if (!(await canViewOffers(propertyId, userId))) {
        redirect(`/properties/${propertyId}`);
    }
    const isManaging = await canManageProperty(propertyId, userId);
    const isVendorViewer = await isPropertyVendor(propertyId, userId);
    const canSeeConditions = isManaging || isVendorViewer;

    const eventsResult = await pool.query<ChainEventRow>(
        `SELECT e.property_id, e.sequence, e.event_type, e.actor_id, e.timestamp, e.details, e.canonical_details, e.nonce, e.hash, e.prev_hash, u.name AS actor_name
        FROM events e
        JOIN users u ON u.user_id = e.actor_id
        WHERE e.property_id = $1
        ORDER BY e.sequence ASC`,
        [propertyId]
    );
    const events = eventsResult.rows;
    const verificationStatus = verifyChain(events);

    const failuresBySequence = new Map<number, Failure[]>();
    for (const failure of verificationStatus.failures) {
        const existing = failuresBySequence.get(failure.sequence) ?? [];
        existing.push(failure);
        failuresBySequence.set(failure.sequence, existing);
    }

    const bidActorIds = events
        .filter((event) => event.event_type === "BID_PLACED" || event.event_type === "BID_REVISED" || event.event_type === "BID_WITHDRAWN" || event.event_type === "BID_RECONFIRMED")
        .map((event) => event.actor_id);
    const participantLabel = makeParticipantLabel({
        isManaging,
        isVendorViewer,
        viewerId: userId,
        agentId: property.agent_id,
        vendorId: property.vendor_id,
        aliases: buildBidderAliases(bidActorIds),
    });

    function visibleDetailEntries(details: unknown): [string, string][] {
        if (details === null || typeof details !== "object" || Array.isArray(details)) {
            return [];
        }
        const entries: [string, string][] = [];
        for (const [key, value] of Object.entries(details)) {
            if (value === null) {
                continue;
            }
            const allowed = PUBLIC_DETAIL_KEYS.includes(key) || (canSeeConditions && TERMS_DETAIL_KEYS.includes(key));
            if (!allowed) {
                continue;
            }
            if (typeof value === "number" && (key.includes("amount") || key.includes("price"))) {
                entries.push([key, formatPrice(value)]);
            } else if (Array.isArray(value)) {
                entries.push([key, value.join(", ")]);
            } else {
                entries.push([key, String(value)]);
            }
        }
        return entries;
    }

    let overallBadge;
    if (verificationStatus.valid) {
        overallBadge = (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-verified">
                <BadgeCheck className="h-4 w-4" />
                Chain verified · {verificationStatus.eventCount} events
            </span>
        );
    } else {
        overallBadge = (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                <BadgeX className="h-4 w-4" />
                Integrity check failed · {verificationStatus.failures.length} problem{verificationStatus.failures.length === 1 ? "" : "s"}
            </span>
        );
    }

    return (
        <main className="mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-brand">Full event record</h1>
                    <p className="text-sm text-gray-500">{property.address_line_1}, {property.city}</p>
                </div>
                {overallBadge}
            </div>

            <div className="mb-6 flex items-center gap-4">
                <Link href={`/properties/${propertyId}`} className="text-sm text-action underline">← Back to property</Link>
                {canSeeConditions && (
                    <a href={`/api/properties/${propertyId}/record`} className="text-sm text-action underline">Export full record (JSON)</a>
                )}
            </div>

            <ol className="space-y-4">
                {events.map((event) => {
                    const failures = failuresBySequence.get(event.sequence) ?? [];
                    const failed = failures.length > 0;
                    return (
                        <li key={event.sequence} className={"rounded-xl border bg-white p-5 shadow-sm " + (failed ? "border-red-300" : "border-slate-200")}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-ink">
                                    #{event.sequence} · {eventTypeLabel(event.event_type)}
                                </p>
                                {failed ? (
                                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                        {failures.map((failure) => failure.reason).join(", ")}
                                    </span>
                                ) : (
                                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-verified">verified</span>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-gray-500">
                                {participantLabel(event.actor_id, event.actor_name)} · {event.timestamp.toLocaleString("en-GB")}
                            </p>

                            {visibleDetailEntries(event.details).length > 0 && (
                                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                                    {visibleDetailEntries(event.details).map(([key, value]) => (
                                        <div key={key} className="flex justify-between gap-3 text-xs">
                                            <dt className="text-gray-500">{key.replaceAll("_", " ")}</dt>
                                            <dd className="text-right font-medium text-ink">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}

                            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 font-mono text-[10px] text-gray-400">
                                <p className="break-all"><span className="text-gray-500">hash</span> {event.hash}</p>
                                <p className="break-all"><span className="text-gray-500">prev</span> {event.prev_hash}</p>
                                <p className="break-all"><span className="text-gray-500">nonce</span> {event.nonce}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </main>
    );
}