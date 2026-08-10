import pool from "@/lib/db";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { canViewOffers } from "@/lib/permissions";
import { EventRow, verifyChain } from "@/lib/chain";
import { eventTypeLabel, formatPrice } from "@/lib/format";
import { Property } from "@/lib/types";

type ReportRouteParams = {
    id: string;
};

type ReportPageProps = {
    params: Promise<ReportRouteParams>;
};

type ReportEventRow = EventRow & {
    actor_name: string;
    actor_role: string;
};

type ReportOfferRow = {
    offer_id: number;
    current_amount: number;
    conditions: string | null;
    status: string;
    created_at: Date;
    name: string;
};

export default async function ReportPage(props: ReportPageProps) {
    const params = await props.params;
    const propertyId = Number(params.id);

    if (Number.isNaN(propertyId)) {
        notFound();
    }

    const session = await auth();

    if (session === null) {
        redirect("/login");
    }

    const userId = Number(session.user.id);

    if (!(await canViewOffers(propertyId, userId))) {
        notFound();
    }

    const propertyResult = await pool.query<Property & { agency_name: string; agent_name: string }>(
        `SELECT p.*, ap.agency_name, u.name AS agent_name
        FROM properties p
        JOIN users u ON u.user_id = p.agent_id
        LEFT JOIN agent_profiles ap ON ap.user_id = p.agent_id
        WHERE p.property_id = $1`,
        [propertyId]
    );

    const property = propertyResult.rows[0];

    if (property === undefined) {
        notFound();
    }

    const eventsResult = await pool.query<ReportEventRow>(
        `SELECT e.property_id, e.sequence, e.event_type, e.actor_id, e.timestamp,
        e.details, e.canonical_details, e.nonce, e.hash, e.prev_hash,
        u.name AS actor_name, u.role AS actor_role
        FROM events e
        JOIN users u ON u.user_id = e.actor_id
        WHERE e.property_id = $1
        ORDER BY e.sequence ASC`,
        [propertyId]
    );

    const events = eventsResult.rows;
    const verification = verifyChain(events);

    const offersResult = await pool.query<ReportOfferRow>(
        `SELECT o.offer_id, o.current_amount, o.conditions, o.status, o.created_at, u.name
        FROM offers o
        JOIN users u ON u.user_id = o.bidder_id
        WHERE o.property_id = $1
        ORDER BY o.current_amount DESC`,
        [propertyId]
    );

    const offers = offersResult.rows;

    const generatedAt = new Date();

    let verificationBlock;
    if (verification.valid) {
        verificationBlock = (
            <div className="rounded border border-teal-300 bg-teal-50 p-4">
                <p className="font-semibold text-verified">Chain verified</p>
                <p className="mt-1 text-sm text-gray-700">
                    All {verification.eventCount} events recompute to their stored hashes and
                    link correctly from the genesis event. No alteration to the recorded
                    sequence has been detected.
                </p>
            </div>
        );
    } else {
        verificationBlock = (
            <div className="rounded border border-red-300 bg-red-50 p-4">
                <p className="font-semibold text-red-700">Integrity check failed</p>
                <ul className="mt-1 text-sm text-red-800">
                    {verification.failures.map((failure) => {
                        return (
                            <li key={failure.sequence + failure.reason}>
                                Event {failure.sequence}: {failure.reason}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    return (
        <main className="mx-auto max-w-4xl px-6 py-10 print:max-w-none print:px-0 print:py-0">

            <header className="border-b border-slate-300 pb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    BidChain - bidding record
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-brand">
                    {property.address_line_1}, {property.city} {property.postcode}
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                    Marketed by {property.agency_name} · Asking price {formatPrice(property.asking_price)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    Report generated {generatedAt.toLocaleString("en-GB")} for {session.user.name}
                </p>
            </header>

            <section className="mt-6 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Verification
                </h2>
                {verificationBlock}
                <p className="text-xs text-gray-500">
                    Each event is hashed together with the hash of the event before it, so any
                    alteration to a past event breaks every subsequent link. The hashes below
                    can be recomputed independently from the exported record; see the
                    verification note at the end of this report.
                </p>
            </section>

            <section className="mt-8 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Offers
                </h2>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-slate-300 text-left">
                            <th className="py-2 font-medium">Bidder</th>
                            <th className="py-2 font-medium">Amount</th>
                            <th className="py-2 font-medium">Conditions</th>
                            <th className="py-2 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offers.map((offer) => {
                            let conditionsCell;
                            if (offer.conditions === null) {
                                conditionsCell = "-";
                            } else {
                                conditionsCell = offer.conditions;
                            }

                            return (
                                <tr key={offer.offer_id} className="border-b border-slate-200">
                                    <td className="py-2">{offer.name}</td>
                                    <td className="py-2">{formatPrice(offer.current_amount)}</td>
                                    <td className="py-2">{conditionsCell}</td>
                                    <td className="py-2 capitalize">{offer.status}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>

            <section className="mt-8 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Event record
                </h2>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-slate-300 text-left">
                            <th className="py-2 font-medium">#</th>
                            <th className="py-2 font-medium">Event</th>
                            <th className="py-2 font-medium">Actor</th>
                            <th className="py-2 font-medium">Recorded</th>
                            <th className="py-2 font-medium">Hash</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => {
                            return (
                                <tr key={event.sequence} className="border-b border-slate-200 align-top">
                                    <td className="py-2">{event.sequence}</td>
                                    <td className="py-2">{eventTypeLabel(event.event_type)}</td>
                                    <td className="py-2">
                                        {event.actor_name}
                                        <span className="ml-1 text-xs text-gray-500">({event.actor_role})</span>
                                    </td>
                                    <td className="py-2">{event.timestamp.toLocaleString("en-GB")}</td>
                                    <td className="py-2 font-mono text-xs break-all">{event.hash}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>

            <section className="mt-8 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Verifying this record independently
                </h2>
                <p className="text-sm text-gray-700">
                    Each event&apos;s hash is the SHA-256 digest of its fields joined in a fixed
                    order: property id, sequence, event type, actor id, timestamp, the canonical
                    (key-sorted) JSON of its details, a random nonce, and the hash of the
                    preceding event. The first event links to a genesis value of sixty-four
                    zeros. Recomputing each hash in sequence and comparing it with the stored
                    value confirms that no event has been altered or removed.
                </p>
                <p className="text-sm text-gray-700">
                    The complete record, including the canonical details and nonce needed to
                    recompute each hash, can be exported as JSON from this property&apos;s page.
                </p>
            </section>
        </main>
    );
}