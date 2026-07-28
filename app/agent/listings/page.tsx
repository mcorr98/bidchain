import pool from "@/lib/db";
import Link from "next/link";
import { formatPrice, listingTypeLabel, featuresLine, eventTypeLabel } from "@/lib/format";
import { BiddingState } from "@/lib/types";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EventType } from "@/lib/chain";

type AgentStats = {
    total_listings: string;
    open_count: string;
    active_offers: string;
};

type AgentListingRow = {
    property_id: number;
    address_line_1: string;
    city: string;
    state: BiddingState;
    asking_price: number;
    top_offer: number | null;
    offer_count: string;
    created_at: Date;
};

type ActivityRow = {
    event_id: number;
    event_type: EventType;
    timestamp: Date;
    property_id: number;
    address_line_1: string;
    actor_name: string;
};

/**
 * "Listings" dashboard which can be viewed by a logged in agent, surfacing key information
 * @returns - listings page content HTML
 */
export default async function AgentListingsPage() {

    const session = await auth();
    if (!session || session.user.role !== "agent") {
        redirect("/login");
    }

    const agentId = Number(session.user.id); 
   
    const statsResult = await pool.query<AgentStats>(
        `SELECT 
        COUNT(DISTINCT p.property_id) AS total_listings,
        COUNT(DISTINCT p.property_id) FILTER (WHERE p.state = 'open') AS open_count,
        COUNT(o.offer_id) FILTER (WHERE o.status = 'active') AS active_offers
        FROM properties p
        LEFT JOIN offers o ON o.property_id = p.property_id
        WHERE p.agent_id = $1`, 
        [agentId]
    );
    const stats = statsResult.rows[0];


    const listingResult = await pool.query<AgentListingRow>(
        `SELECT p.property_id, p.address_line_1, p.city, p.state, p.asking_price,
        MAX(o.current_amount) FILTER (WHERE o.status = 'active') AS top_offer,
        COUNT(o.offer_id) FILTER (WHERE o.status = 'active') AS offer_count,
        p.created_at
        FROM properties p
        LEFT JOIN offers o ON o.property_id = p.property_id
        WHERE p.agent_id = $1
        GROUP BY p.property_id 
        ORDER BY p.created_at DESC`,
        [agentId]
    ); 
    const listings = listingResult.rows; 

    const activityResult = await pool.query<ActivityRow>(
        `SELECT e.event_id, e.event_type, e.timestamp, e.property_id, p.address_line_1, u.name AS actor_name
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        JOIN users u ON u.user_id = e.actor_id
        WHERE p.agent_id = $1
        ORDER BY e.timestamp DESC
        LIMIT 15`, 
        [agentId]
    ); 
    const activity = activityResult.rows;

    return (
    <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
            <Link href="/agent/listings/new" className="rounded bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-strong">
                New listing
            </Link>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-gray-500">Listings</p>
                <p className="text-2xl font-semibold text-brand">{stats.total_listings}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-gray-500">Bidding open</p>
                <p className="text-2xl font-semibold text-brand">{stats.open_count}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-gray-500">Active offers</p>
                <p className="text-2xl font-semibold text-brand">{stats.active_offers}</p>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Your listings</h2>
                <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {listings.map((listing) => {
                        let topOfferLine;
                        if (listing.top_offer === null) {
                            topOfferLine = <span className="text-gray-400">No offers</span>;
                        } else {
                            topOfferLine = (
                                <span className="font-semibold text-brand">
                                    {formatPrice(listing.top_offer)}
                                    <span className="ml-1 font-normal text-gray-500">
                                        ({listing.offer_count})
                                    </span>
                                </span>
                            );
                        }

                        let rowStateBadge = null;
                        if (listing.state !== "open") {
                            rowStateBadge = (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-600">
                                    {listing.state}
                                </span>
                            );
                        }

                        return (
                            <li key={listing.property_id}>
                                <Link href={`/properties/${listing.property_id}`}
                                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-ink">{listing.address_line_1}</p>
                                            <p className="text-xs text-gray-500">{listing.city}</p>
                                        </div>
                                        {rowStateBadge}
                                    </div>
                                    <p className="text-sm">{topOfferLine}</p>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Recent activity</h2>
                <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {activity.map((item) => {
                        return (
                            <li key={item.event_id} className="px-4 py-3">
                                <p className="text-sm font-medium text-ink">{eventTypeLabel(item.event_type)}</p>
                                <p className="text-xs text-gray-500">
                                    {item.address_line_1} · {item.actor_name}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {item.timestamp.toLocaleDateString("en-GB")}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    </main>
);
}
