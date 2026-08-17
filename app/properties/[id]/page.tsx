import pool from "@/lib/db";
import { Property } from "@/lib/types";
import { notFound } from "next/navigation";
import { listingTypeLabel, formatPrice, featuresLine, eventTypeLabel } from "@/lib/format";
import BidForm from "@/components/bid-form";
import { auth } from "@/auth";
import { canBidOn, canManageProperty, canViewOffers, isPropertyVendor } from "@/lib/permissions";
import { EventRow, verifyChain } from "@/lib/chain";
import InvitationForm from "@/components/invite-participants-form"
import CloseBiddingButton from "@/components/close-bidding-button";
import AcceptBidButton from "@/components/accept-bid-button";
import CompleteSaleButton from "@/components/complete-sale-button";
import WithdrawBidButton from "@/components/withdraw-bid-button";
import CollapseSaleForm from "@/components/collapse-sale-form";
import RelistForm from "@/components/relist-form";
import WithdrawListingForm from "@/components/withdraw-listing-form";
import ReinviteButton from "@/components/reinvite-button";
import SectionHeading from "@/components/section-heading";
import { HandCoins, Users, Link2, ChevronDown, Globe } from "lucide-react";
import PublishListingButton from "@/components/publish-listing-button";

type PropertyRouteParams = {
    id: string;
}
type PropertyPageProps = {
    params: Promise<PropertyRouteParams>
}

type OfferRow = {
    bidder_id: number,
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

type VendorContactRow = {
    name: string;
    email: string;
    phone: string | null;
    correspondence_address: string | null;
};

type AgentContactRow = {
    name: string;
    agency_name: string;
    phone: string | null;
    office_address: string | null;
};

type PendingInviteRow = {
    email: string;
};

export default async function PropertyPage(props: PropertyPageProps) {

    const params = await props.params;
    const propertyId = Number(params.id);

    if (!Number.isInteger(propertyId) || propertyId < 1) {
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
    let addressLine;
    if (property.address_line_2 === null) {
        addressLine = property.address_line_1;
    } else {
        addressLine = property.address_line_1 + ", " + property.address_line_2;
    }

    const session = await auth();
    const userId = Number(session?.user.id);

    // Permissions 
    let canBid = false;
    const isDraft = property.state === "draft";
    if (session !== null) {
        canBid = await canBidOn(property.property_id, userId);
    }
    let isManaging = false;
    if (session?.user.role === "agent") {
        isManaging = await canManageProperty(property.property_id, userId);
    }
    let isVendor = false;
    if (session !== null) {
        isVendor = await isPropertyVendor(property.property_id, userId);
    }

    let vendorContact: VendorContactRow | null = null;
    if (isManaging) {
        const vendorContactResult = await pool.query<VendorContactRow>(
            `SELECT u.name, u.email, vp.phone, vp.correspondence_address
            FROM vendor_profiles vp
            JOIN users u ON u.user_id = vp.user_id
            WHERE vp.user_id = $1`,
            [property.vendor_id]
        );
        vendorContact = vendorContactResult.rows[0] ?? null;
    }

    if (isDraft && !isManaging && !isVendor) {
        notFound();
    }

    let agentContact: AgentContactRow | null = null;
    if (session !== null && !isManaging && !isVendor) {
        const agentContactResult = await pool.query<AgentContactRow>(
            `SELECT u.name, ap.agency_name, ap.phone, ap.office_address
            FROM agent_profiles ap
            JOIN users u ON u.user_id = ap.user_id
            WHERE ap.user_id = $1`,
            [property.agent_id]
        );
        agentContact = agentContactResult.rows[0] ?? null;
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
    } else if (isManaging && isDraft) {
        if (property.vendor_id === null) {
            actionSection = <p className="text-sm text-gray-500">Waiting for the vendor to accept their invitation — publishing unlocks when they do.</p>;
        } else {
            actionSection = <PublishListingButton propertyId={property.property_id} />;
        }
    } else if (isManaging) {
        actionSection = <p className="text-sm text-gray-500">Bidding is {property.state}.</p>;
    } else if (session?.user.role === "agent") {
        actionSection = <p className="text-sm text-gray-500">You don't manage this property.</p>;
    } else if (isVendor && isDraft) {
        actionSection = <p className="text-sm text-gray-500">You've accepted this listing: your agent will publish it when ready.</p>;
    } else if (isVendor) {
        actionSection = <p className="text-sm text-gray-500">You are the vendor of this property.</p>;
    } else if (session !== null && property.state !== "open") {
        actionSection = <p className="text-sm text-gray-500">Bidding is closed.</p>;
    } else if (session !== null) {
        actionSection = <p className="text-sm text-gray-500">Bidding is open to invited participants.</p>;
    }

    // Offers section 
    let canSeeChain = false;
    if (session !== null) {
        canSeeChain = await canViewOffers(property.property_id, Number(session.user.id))
    }

    let offersSection = null;
    if (canSeeChain && !isDraft) {
        let offersContent;
        const offersResult = await pool.query<OfferRow>(
            `SELECT o.offer_id, o.current_amount, o.conditions, o.status, o.created_at, o.bidder_id, u.name
            FROM offers o
            JOIN users u ON u.user_id = o.bidder_id
            WHERE o.property_id = $1 AND o.status IN ('active', 'accepted')
            ORDER BY o.status = 'accepted' DESC, o.current_amount DESC`,
            [propertyId]
        );
        const offers = offersResult.rows;
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

                        let acceptedChip = null;
                        if (offer.status === "accepted") {
                            acceptedChip = (
                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-verified">
                                    accepted
                                </span>
                            );
                        }

                        let withdrawControl = null;
                        if (offer.bidder_id === userId && (property.state === "open" || property.state === "closed")) {
                            withdrawControl = <WithdrawBidButton propertyId={property.property_id} offerId={offer.offer_id} />;
                        }
                        return (
                            <li key={offer.offer_id} className="flex items-start justify-between py-3">
                                <div>
                                    <p className="font-medium text-ink">{offer.name}</p>
                                    {conditionsLine}
                                    {withdrawControl}
                                </div>
                                <div className="flex items-center gap-3">
                                    {acceptedChip}
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
                <SectionHeading icon={HandCoins} label="Current offers" />
                {offersContent}
            </div>
        );
    }

    // Chain section
    let chainSection = null;
    if (canSeeChain && !isDraft) {
        let badge;
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

        const displayEvents = [...events].reverse();
        const recentEvents = displayEvents.slice(0, 5);
        const earlierEvents = displayEvents.slice(5);

        function renderEventItem(event: EventRow & { actor_name: string }) {
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
        }

        chainSection = (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="space-y-1.5">
                    <SectionHeading icon={Link2} label="History" />
                    {badge}
                </div>
                <ol className="border-l-2 border-slate-200 pl-4">
                    {recentEvents.map(renderEventItem)}
                </ol>
                {earlierEvents.length > 0 && (
                    <details className="group">
                        <summary className="cursor-pointer list-none text-xs text-action underline">
                            <span className="group-open:hidden">Show {earlierEvents.length} earlier events</span>
                            <span className="hidden group-open:inline">Hide earlier events</span>
                        </summary>
                        <ol className="mt-3 border-l-2 border-slate-200 pl-4">
                            {earlierEvents.map(renderEventItem)}
                        </ol>
                    </details>
                )}
                <div className="border-t border-slate-200 pt-3">
                    <a href={`/api/properties/${property.property_id}/receipt`} className="text-xs text-action underline">Download chain receipt</a>
                </div>
            </div>
        );
    }

    let participants: ParticipantRow[] = [];
    let pendingInvites: PendingInviteRow[] = [];
    if (isManaging && !isDraft) {
        const participantResult = await pool.query<ParticipantRow>(
            `SELECT pp.participant_id, u.name, u.email, pp.status
            FROM property_participants pp
            JOIN users u ON u.user_id = pp.user_id
            WHERE pp.property_id = $1
            ORDER BY pp.status, u.name`,
            [propertyId]
        );
        participants = participantResult.rows;

        const pendingInvitesResult = await pool.query<PendingInviteRow>(
            `SELECT DISTINCT i.email
            FROM invitations i
            WHERE i.property_id = $1 AND i.purpose = 'bidder_invite' AND i.accepted_at IS NULL AND i.expires_at > NOW() AND NOT EXISTS (
                SELECT 1 FROM property_participants pp
                JOIN users u ON u.user_id = pp.user_id
                WHERE pp.property_id = $1 AND u.email = i.email
            )`,
            [propertyId]
        );
        pendingInvites = pendingInvitesResult.rows;
    }

    // Participant section (agent view only)
    let participantSection = null;
    if (isManaging && !isDraft) {
        let participantList;
        if (participants.length === 0 && pendingInvites.length === 0) {
            participantList = (
                <p className="text-sm text-gray-500">No bidders yet. Invite a bidder to get started.</p>
            );
        } else {
            participantList = (
                <ul className="divide-y divide-slate-200">
                    {participants.map((participant) => {
                        let reinviteControl = null;
                        if (participant.status !== "joined") {
                            reinviteControl = (
                                <ReinviteButton propertyId={property.property_id} email={participant.email} />
                            );
                        }
                        return (
                            <li key={participant.participant_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-ink">{participant.name}</p>
                                    <p className="truncate text-xs text-gray-500">{participant.email}</p>
                                </div>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                                    {participant.status}
                                </span>
                                {reinviteControl}
                            </li>
                        );
                    })}
                    {pendingInvites.map((invite) => (
                        <li key={invite.email} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 opacity-60">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{invite.email}</p>
                                <p className="truncate text-xs text-gray-500">No account yet</p>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                                invited
                            </span>
                            <ReinviteButton propertyId={property.property_id} email={invite.email} />
                        </li>
                    ))}
                </ul>
            )
        }
        participantSection = (
            <div className="space-y-2">
                <SectionHeading icon={Users} label="Bidders" />
                {participantList}
                {property.state === "open" && <InvitationForm propertyId={property.property_id} />}
            </div>
        );

    }

    //Close bidding
    let closeControl = null;
    if (isManaging && property.state === "open") {
        closeControl = <CloseBiddingButton propertyId={property.property_id} />;
    }

    let stateBadge = null;
    if (isDraft) {
        stateBadge = (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-800">
                {property.vendor_id === null ? "Draft - awaiting vendor" : "Draft - ready to publish"}
            </span>
        );
    } else if (property.state !== "open") {
        stateBadge = (
            <span className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-700">
                {property.state}
            </span>
        );
    }

    // Complete sale 
    let completeControl = null;
    if (isManaging && property.state === "sale_agreed") {
        completeControl = <CompleteSaleButton propertyId={property.property_id} />;
    }

    // Collapse sale 
    let canCollapse = false;
    if (property.state === "sale_agreed") {
        if (isVendor) {
            canCollapse = true;
        } else if (session !== null) {
            const accepted = await pool.query(
                `SELECT offer_id FROM offers WHERE property_id = $1 AND status = 'accepted' AND bidder_id = $2`,
                [propertyId, userId]
            );
            canCollapse = accepted.rows.length > 0;
        }
    }
    let collapseControl = null;
    if (canCollapse) {
        collapseControl = <CollapseSaleForm propertyId={property.property_id} />;
    }

    // Re-lisiting 
    let relistControl = null;
    if (isManaging && property.state === "collapsed") {
        relistControl = (
            <RelistForm propertyId={property.property_id} currentAskingPricePounds={property.asking_price / 100} />
        );
    }

    // Withdraw Listing  
    let withdrawListingControl = null;
    if (isManaging && (property.state === "open" || property.state === "closed")) {
        withdrawListingControl = <WithdrawListingForm propertyId={property.property_id} />;
    }

    const hasManageActions =
        closeControl !== null ||
        completeControl !== null ||
        collapseControl !== null ||
        relistControl !== null ||
        withdrawListingControl !== null;

    let manageSection = null;
    if (hasManageActions) {
        manageSection = (
            <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4">
                    <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">Manage listing</span>
                    <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-slate-200 px-6 py-4">
                    {closeControl}
                    {completeControl}
                    {collapseControl}
                    {relistControl}
                    {withdrawListingControl}
                </div>
            </details>
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
                        {property.listing_url !== null && (
                            <a href={property.listing_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 pt-1 text-sm text-action underline">
                                <Globe className="h-4 w-4" />
                                View online
                            </a>
                        )}
                    </div>
                    {offersSection}
                    {participantSection}
                    {manageSection}
                </div>
                <div className="space-y-6 lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">{listingTypeLabel(property.listing_type)}</p>
                        <p className="text-3xl font-semibold text-brand">{formatPrice(property.asking_price)}</p>
                        {actionSection !== undefined && (
                            <div className="mt-4 border-t border-slate-200 pt-4">
                                {actionSection}
                            </div>
                        )}
                        {vendorContact !== null && (
                            <div className="mt-4 border-t border-slate-200 pt-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor</p>
                                <p className="mt-1 text-sm font-medium text-ink">{vendorContact.name}</p>
                                <p className="text-sm text-gray-500">{vendorContact.email}</p>
                                {vendorContact.phone !== null && <p className="text-sm text-gray-500">{vendorContact.phone}</p>}
                            </div>
                        )}
                        {agentContact !== null && (
                            <div className="mt-4 border-t border-slate-200 pt-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Listing agent</p>
                                <p className="mt-1 text-sm font-medium text-ink">{agentContact.agency_name}</p>
                                <p className="text-sm text-gray-500">{agentContact.name}</p>
                                {agentContact.phone !== null && <p className="text-sm text-gray-500">{agentContact.phone}</p>}
                            </div>
                        )}
                    </div>
                    {chainSection}
                </div>
            </div>
        </main>
    );
}