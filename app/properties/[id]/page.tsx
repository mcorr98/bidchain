import pool from "@/lib/db";
import { Property } from "@/lib/types";
import { notFound } from "next/navigation";
import { listingTypeLabel, formatPrice, featuresLine } from "@/lib/format";
import BidForm from "@/components/bid-form";
import { auth } from "@/auth";
import { canBidOn, canManageProperty, canViewOffers, isPropertyVendor } from "@/lib/permissions";
import { EventRow, verifyChain } from "@/lib/chain";
import { eventTypeLabel } from "@/lib/format";
import InvitationForm from "@/components/invite-participants-form"
import CloseBiddingButton from "@/components/close-bidding-button";
import AcceptBidButton from "@/components/accept-bid-button";

type PropertyRouteParams = {
    id: string;
}
type PropertyPageProps = {
    params: Promise<PropertyRouteParams>
}

type OfferRow = {
    offer_id: number,
    current_amount: number,
    conditions: string | null,
    status: string,
    created_at: Date,
    name: string

}

type ParticipantRow = {
    participant_id: number;
    name: string;
    email: string;
    status: string;
};

export default async function PropertyPage(props: PropertyPageProps) {

    const params = await props.params;
    const propertyId = Number(params.id);

    if (Number.isNaN(propertyId)) {
        notFound();
    }

    const result = await pool.query<Property>(`
    SELECT * FROM properties 
    WHERE properties.property_id = $1`,
        [propertyId]
    );

    const property = result.rows[0];

    if (property === undefined) {
        notFound();
    }

    // Property details 
    let imageSrc;
    if (property.image_path === null) {
        imageSrc = "/placeholder.jpg";
    } else {
        imageSrc = property.image_path;
    }

    let addressLine;
    if (property.address_line_2 === null) {
        addressLine = property.address_line_1;
    } else {
        addressLine = property.address_line_1 + ", " + property.address_line_2;
    }

    let descriptionLine;
    if (property.description === null) {
        descriptionLine = null;
    } else {
        descriptionLine = <p className="max-w-prose line-clamp-4">{property.description}</p>;
    }

    const session = await auth();
    let userId = Number(session?.user.id);

    // Permissions 
    let canBid = false;
    if (session?.user.role === "bidder") {
        canBid = await canBidOn(property.property_id, userId);
    }
    let isManaging = false;
    if (session?.user.role === "agent") {
        isManaging = await canManageProperty(property.property_id, userId);
    }
    let isVendor = false;
    if (session?.user.role === "vendor") {
        isVendor = await isPropertyVendor(property.property_id, userId);
    }

    // Property image 
    let imageArea;
    if (property.image_path === null) {
        imageArea = (
            <div className="flex h-48 w-full items-center justify-center bg-slate-100">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Photo to follow
                </span>
            </div>
        );
    } else {
        imageArea = (
            <img src={property.image_path} alt={property.address_line_1 + ", " + property.city} className="h-96 w-full object-cover rounded-xl" />
        );
    }

    //Action panel - bid / invite bidders. Likely to change when I refactor agent views 
    let actionSection;
    if (canBid && property.state === "open") {
        actionSection = <BidForm propertyId={property.property_id} />;
    } else if (session?.user.role === "bidder" && property.state !== "open") {
        actionSection = <p className="text-sm text-gray-500">Bidding is closed.</p>;
    } else if (session?.user.role === "bidder") {
        actionSection = <p className="text-sm text-gray-500">Bidding is open to invited participants.</p>;
    } else if (isManaging && property.state === "open") {
        actionSection = <InvitationForm propertyId={property.property_id} />;
    } else if (isManaging) {
        actionSection = <p className="text-sm text-gray-500">Bidding is {property.state}.</p>;
    } else if (session?.user.role === "agent") {
        actionSection = <p className="text-sm text-gray-500">You don't manage this property.</p>;
    }

    // Offers section 
    let canSeeChain = false;
    if (session !== null) {
        canSeeChain = await canViewOffers(property.property_id, Number(session.user.id))
    }

    let offersResult = await pool.query<OfferRow>(`
        SELECT o.offer_id, o.current_amount, o.conditions, o.status, o.created_at, u.name
        FROM offers o
        JOIN users u ON u.user_id = o.bidder_id
        WHERE o.property_id = $1 AND o.status = 'active'
        ORDER BY o.current_amount DESC`,
        [propertyId]
    );
    const offers = offersResult.rows;

    let offersSection = null;
    if (canSeeChain) {
        let offersContent;
        if (offers.length === 0) {
            offersContent = (
                <p className="text-sm text-gray-500">No offers yet</p>
            );
        } else {
            offersContent = (
                <ul className="divide-y divide-slate-200">
                    {offers.map((offer) => {
                        let conditionsLine = null;
                        if (offer.conditions !== null) {
                            conditionsLine = (
                                <p className="text-sm text-gray-500">{offer.conditions}</p>
                            );
                        }

                        let acceptControl = null;
                        if (isVendor && property.state === "closed") {
                            acceptControl = (
                                <AcceptBidButton propertyId={property.property_id} offerId={offer.offer_id} />
                            );
                        }
                        console.log("isVendor:", isVendor, "state:", property.state)
                        return (
                            <li key={offer.offer_id} className="flex items-start justify-between py-3">
                                <div>
                                    <p className="font-medium text-ink">{offer.name}</p>
                                    {conditionsLine}
                                </div>
                                <div className="flex items-center gap-3">
                                    <p className="text-lg font-semibold text-brand">
                                        {formatPrice(offer.current_amount)}
                                    </p>
                                    {acceptControl}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            );
        }
        offersSection = (
            <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Current offers
                </h2>
                {offersContent}
            </div>
        );
    }




    //Chain section
    const eventsResult = await pool.query<EventRow & { actor_name: string }>(
        `SELECT e.property_id, e.sequence, e.event_type, e.actor_id, e.timestamp, e.details, e.canonical_details, e.nonce, e.hash, e.prev_hash, u.name AS actor_name 
        FROM events e 
        JOIN users u ON u.user_id = e.actor_id
        WHERE e.property_id = $1
        ORDER BY e.sequence ASC`,
        [propertyId]
    );

    const events = eventsResult.rows;
    const verification = verifyChain(events);

    let chainSection = null;
    if (canSeeChain) {
        let badge;
        if (verification.valid) {
            badge = (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-verified">
                    Chain verified · {verification.eventCount} events
                </span>
            );
        } else {
            badge = (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                    Integrity check failed at event {verification.failures[0].sequence}
                </span>
            );
        }

        chainSection = (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Event record</h2>
                    {badge}
                </div>
                <ol className="border-l-2 border-slate-200 pl-4">
                    {events.map((event) => {
                        let amountLine = null;
                        if (event.details !== null && typeof event.details === "object" && !Array.isArray(event.details) && typeof event.details.amount === "number") {
                            amountLine = (
                                <p className="text-sm font-medium text-brand">
                                    {formatPrice(event.details.amount)}
                                </p>
                            );
                        }
                        return (
                            <li key={event.sequence} className="relative pb-4">
                                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-verified" />
                                <p className="text-sm font-medium">
                                    {eventTypeLabel(event.event_type)}
                                    <span className="ml-2 font-normal text-gray-500">#{event.sequence}</span>
                                </p>
                                <p className="text-sm text-gray-500">
                                    {event.actor_name} · {event.timestamp.toLocaleDateString("en-GB")}
                                </p>
                                {amountLine}
                            </li>
                        );
                    })}
                </ol>
            </div>
        );
    }

    let participants: ParticipantRow[] = [];
    if (isManaging) {
        const participantResult = await pool.query<ParticipantRow>(
            `SELECT pp.participant_id, u.name, u.email, pp.status
                FROM property_participants pp
                JOIN users u ON u.user_id = pp.user_id
                WHERE pp.property_id = $1
                ORDER BY pp.status, u.name`,
            [propertyId]
        );
        participants = participantResult.rows;
    }

    // Participant section (agent view only)
    let participantSection = null;
    if (isManaging) {
        let participantList;
        if (participants.length === 0) {
            participantList = (
                <p className="text-sm text-gray-500">No participants yet. Invite a bidder to get started.</p>
            );
        } else {
            participantList = (
                <ul className="divide-y divide-slate-200">
                    {participants.map((participant) => {
                        return (
                            <li key={participant.participant_id} className="flex items-center justify-between py-2">
                                <div>
                                    <p className="text-sm font-medium text-ink">{participant.name}</p>
                                    <p className="text-sm text-gray-500">{participant.email}</p>
                                </div>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-600">
                                    {participant.status}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )
        }
        participantSection = (
            <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Participants</h2>
                {participantList}
            </div>
        );

    }

    //Close bidding
    let closeControl = null;
    if (isManaging && property.state === "open") {
        closeControl = <CloseBiddingButton propertyId={property.property_id} />;
    }

    let stateBadge = null;
    if (property.state !== "open") {
        stateBadge = (
            <span className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-700">
                Bidding {property.state}
            </span>
        );
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            {imageArea}
            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-semibold text-brand">{addressLine}</h1>
                            {stateBadge}
                        </div>
                        <p className="text-gray-600">{property.city}, {property.postcode}</p>
                        <p className="text-sm text-gray-600">{featuresLine(property.bedrooms, property.bathrooms, property.receptions)}</p>
                    </div>
                    {descriptionLine}
                    {offersSection}
                    {chainSection}
                    {participantSection}
                    {closeControl}
                </div>
                <div>
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">{listingTypeLabel(property.listing_type)}</p>
                        <p className="text-3xl font-semibold text-brand">{formatPrice(property.asking_price)}</p>
                        <div className="mt-4 border-t border-slate-200 pt-4">
                            {actionSection}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}