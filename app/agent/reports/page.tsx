import pool from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import StatCard from "@/components/stats-card";
import SectionHeading from "@/components/section-heading";
import { ChartNoAxesColumn, Timer, CircleAlert, Send } from "lucide-react";

type PipelineRow = {
    state: string;
    count: number;
};

type DurationRow = {
    avg_days: number | null;
};

type RatioRow = {
    avg_ratio: number | null;
};

type BidsPerListingRow = {
    avg_bids: number | null;
};

type ActivityRow = {
    acceptances: number;
    collapses: number;
    bids_last_30: number;
};

type CollapseReasonRow = {
    reason: string | null;
    count: number;
};

type LeadRow = {
    email: string;
    purpose: string;
    created_at: Date;
    expires_at: Date;
    address_line_1: string;
};

function collapseReasonLabel(reason: string | null): string {
    if (reason === "chain_collapse") return "Chain collapse";
    if (reason === "survey") return "Survey findings";
    if (reason === "mortgage_declined") return "Mortgage declined";
    if (reason === "no_longer_selling") return "No longer selling";
    if (reason === null) return "No reason given";
    return reason;
}

/**
 * Agency reporting page. Every metric is computed from the event chain 
 * so reporting can never drift
 * @returns - reports page content HTML
 */
export default async function AgentReportsPage() {

    const session = await auth();
    if (!session || session.user.role !== "agent") {
        redirect("/login");
    }
    const agentId = Number(session.user.id);

    // Pipeline: listings counted by bidding state.
    const pipelineResult = await pool.query<PipelineRow>(
        `SELECT p.state, COUNT(*)::int AS count
        FROM properties p
        WHERE p.agent_id = $1
        GROUP BY p.state`,
        [agentId]
    );
    const pipeline: Record<string, number> = {};
    for (const row of pipelineResult.rows) {
        pipeline[row.state] = row.count;
    }

    // Days from property published to first bid accepted 
    const durationResult = await pool.query<DurationRow>(
        `SELECT AVG(days)::float AS avg_days FROM (
        SELECT EXTRACT(EPOCH FROM (MIN(acc.timestamp) - MIN(gen.timestamp))) / 86400 AS days
        FROM properties p
        JOIN events gen ON gen.property_id = p.property_id AND gen.event_type = 'LISTING_CREATED'
        JOIN events acc ON acc.property_id = p.property_id AND acc.event_type = 'BID_ACCEPTED'
        WHERE p.agent_id = $1
        GROUP BY p.property_id
        ) per_property`,
        [agentId]
    );
    const averageDays = durationResult.rows[0].avg_days;

    // Accepted price vs asking price
    const ratioResult = await pool.query<RatioRow>(
        `SELECT AVG(ratio)::float AS avg_ratio FROM (
        SELECT DISTINCT ON (e.property_id) (e.details->>'amount')::numeric / (g.details->>'asking_price_snapshot')::numeric AS ratio
        FROM events e
        JOIN events g ON g.property_id = e.property_id AND g.event_type = 'LISTING_CREATED' AND g.sequence = 1
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type = 'BID_ACCEPTED'
        ORDER BY e.property_id, e.sequence DESC
        ) per_property`,
        [agentId]
    );
    const averageRatio = ratioResult.rows[0].avg_ratio;

    // Bids per listing (only including listings which received at least one bid.)
    const bidsPerListingResult = await pool.query<BidsPerListingRow>(
        `SELECT AVG(bid_count)::float AS avg_bids FROM (
        SELECT COUNT(*) AS bid_count
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type IN ('BID_PLACED', 'BID_REVISED')
        GROUP BY e.property_id
        ) per_property`,
        [agentId]
    );
    const averageBids = bidsPerListingResult.rows[0].avg_bids;

    // Outcome counts in one pass over the chain.
    const activityResult = await pool.query<ActivityRow>(
        `SELECT COUNT(*) FILTER (WHERE e.event_type = 'BID_ACCEPTED')::int AS acceptances,
        COUNT(*) FILTER (WHERE e.event_type = 'SALE_COLLAPSED')::int AS collapses,
        COUNT(*) FILTER (WHERE e.event_type IN ('BID_PLACED', 'BID_REVISED') AND e.timestamp > NOW() - INTERVAL '30 days')::int AS bids_last_30
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1`,
        [agentId]
    );
    const activity = activityResult.rows[0];

    // Collapse reasons
    const collapseReasonsResult = await pool.query<CollapseReasonRow>(
        `SELECT e.details->>'reason' AS reason, COUNT(*)::int AS count
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type = 'SALE_COLLAPSED'
        GROUP BY e.details->>'reason'
        ORDER BY count DESC`,
        [agentId]
    );
    const collapseReasons = collapseReasonsResult.rows;

    // Leads (outstanding invitations this agent has sent that were never
    // accepted)
    const leadsResult = await pool.query<LeadRow>(
        `SELECT DISTINCT ON (i.email, i.property_id) i.email, i.purpose, i.created_at, i.expires_at, p.address_line_1
        FROM invitations i
        JOIN properties p ON p.property_id = i.property_id
        WHERE i.created_by = $1 AND i.accepted_at IS NULL
        ORDER BY i.email, i.property_id, i.created_at DESC`,
        [agentId]
    );
    const leads = [...leadsResult.rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    let daysLabel = "-";
    if (averageDays !== null) {
        daysLabel = averageDays.toFixed(1) + " days";
    }
    let ratioLabel = "-";
    if (averageRatio !== null) {
        ratioLabel = (averageRatio * 100).toFixed(1) + "%";
    }
    let bidsLabel = "-";
    if (averageBids !== null) {
        bidsLabel = averageBids.toFixed(1);
    }
    let collapseLabel = "-";
    if (activity.acceptances > 0) {
        collapseLabel = Math.round((activity.collapses / activity.acceptances) * 100) + "%";
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-brand">Reports</h1>

            <div className="space-y-10">
                <div className="space-y-3">
                    <SectionHeading icon={ChartNoAxesColumn} label="Pipeline" />
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                        <StatCard label="Drafts" value={String(pipeline["draft"] ?? 0)} />
                        <StatCard label="Bidding open" value={String(pipeline["open"] ?? 0)} />
                        <StatCard label="Bidding closed" value={String(pipeline["closed"] ?? 0)} />
                        <StatCard label="Sale agreed" value={String(pipeline["sale_agreed"] ?? 0)} />
                        <StatCard label="Completed" value={String(pipeline["completed"] ?? 0)} />
                        <StatCard label="Collapsed" value={String(pipeline["collapsed"] ?? 0)} />
                    </div>
                </div>

                <div className="space-y-3">
                    <SectionHeading icon={Timer} label="Performance" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <StatCard label="Time to sale agreed" value={daysLabel} />
                        <StatCard label="Achieved vs asking" value={ratioLabel} />
                        <StatCard label="Bids per listing" value={bidsLabel} />
                        <StatCard label="Collapse rate" value={collapseLabel} />
                        <StatCard label="Bids, last 30 days" value={String(activity.bids_last_30)} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
                    <div className="space-y-3">
                        <SectionHeading icon={CircleAlert} label="Collapse reasons" />
                        {collapseReasons.length === 0 ? (
                            <p className="text-sm text-gray-500">No collapsed sales.</p>
                        ) : (
                            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                                {collapseReasons.map((row) => (
                                    <li key={row.reason ?? "none"} className="flex items-center justify-between px-4 py-3">
                                        <p className="text-sm text-ink">{collapseReasonLabel(row.reason)}</p>
                                        <p className="text-sm font-semibold text-brand">{row.count}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="space-y-3">
                        <SectionHeading icon={Send} label="Leads to chase" />
                        {leads.length === 0 ? (
                            <p className="text-sm text-gray-500">No outstanding invitations.</p>
                        ) : (
                            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                                {leads.map((lead) => {
                                    const daysWaiting = Math.floor((Date.now() - lead.created_at.getTime()) / 86400000);
                                    const expired = lead.expires_at.getTime() < Date.now();
                                    return (
                                        <li key={lead.email + lead.address_line_1} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-ink">{lead.email}</p>
                                                <p className="truncate text-xs text-gray-500">
                                                    {lead.purpose === "vendor_activation" ? "Vendor - " : "Bidder - "}
                                                    {lead.address_line_1}
                                                </p>
                                            </div>
                                            {expired ? (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
                                                    expired - re-invite
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400">{daysWaiting}d waiting</span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}