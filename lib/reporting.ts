import pool from "@/lib/db";

export type ReportMetrics = {
    averageDaysToAgreed: number | null;
    averageDaysToFirstBid: number | null;
    averageRatio: number | null;
    averageBidsPerListing: number | null;
    acceptances: number;
    collapses: number;
    collapseReasons: { reason: string | null; count: number }[];
    listingsByMonth: { month: Date; count: number }[];
    averageDaysLostToCollapse: number | null;
    averageRelistDiscount: number | null;
};

/**
 * Calculates the agency's business metrics between a chosen date range.
 * Figures derive from the event chain so reports can't diverge from the record.
 * Every metric answers an actionable business question.
 */
export async function getReportMetrics(agentId: number, fromIso: string, toIso: string): Promise<ReportMetrics> {

    // How long does a sale take? Days from publication to acceptance,
    // per property, for acceptances inside the chosen timeframe.
    const durationResult = await pool.query<{ avg_days: number | null }>(
        `SELECT AVG(days)::float AS avg_days FROM (
        SELECT EXTRACT(EPOCH FROM (MIN(acc.timestamp) - MIN(gen.timestamp))) / 86400 AS days
        FROM properties p
        JOIN events gen ON gen.property_id = p.property_id AND gen.event_type = 'LISTING_CREATED'
        JOIN events acc ON acc.property_id = p.property_id AND acc.event_type = 'BID_ACCEPTED'
        WHERE p.agent_id = $1 AND acc.timestamp BETWEEN $2 AND $3
        GROUP BY p.property_id
        ) per_property`,
        [agentId, fromIso, toIso]
    );

    // Does marketing generate engagement? Days from publication until the first bid.
    const firstBidResult = await pool.query<{ avg_days: number | null }>(
        `SELECT AVG(days)::float AS avg_days FROM (
        SELECT EXTRACT(EPOCH FROM (MIN(b.timestamp) - MIN(gen.timestamp))) / 86400 AS days
        FROM properties p
        JOIN events gen ON gen.property_id = p.property_id AND gen.event_type = 'LISTING_CREATED'
        JOIN events b ON b.property_id = p.property_id AND b.event_type = 'BID_PLACED'
        WHERE p.agent_id = $1 AND b.timestamp BETWEEN $2 AND $3
        GROUP BY p.property_id
        ) per_property`,
        [agentId, fromIso, toIso]
    );

    // Achieved price vs original asking within period
    const ratioResult = await pool.query<{ avg_ratio: number | null }>(
        `SELECT AVG(ratio)::float AS avg_ratio FROM (
        SELECT DISTINCT ON (e.property_id) (e.details->>'amount')::numeric / (g.details->>'asking_price_snapshot')::numeric AS ratio
        FROM events e
        JOIN events g ON g.property_id = e.property_id AND g.event_type = 'LISTING_CREATED' AND g.sequence = 1
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type = 'BID_ACCEPTED'
        AND e.timestamp BETWEEN $2 AND $3
        ORDER BY e.property_id, e.sequence DESC
        ) per_property`,
        [agentId, fromIso, toIso]
    );

    // Bids per listing across listings in period
    const bidsPerListingResult = await pool.query<{ avg_bids: number | null }>(
        `SELECT AVG(bid_count)::float AS avg_bids FROM (
        SELECT COUNT(*) AS bid_count
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type IN ('BID_PLACED', 'BID_REVISED')
        AND e.timestamp BETWEEN $2 AND $3
        GROUP BY e.property_id
        ) per_listing`,
        [agentId, fromIso, toIso]
    );

    const activityResult = await pool.query<{ acceptances: number; collapses: number }>(
        `SELECT
        COUNT(*) FILTER (WHERE e.event_type = 'BID_ACCEPTED')::int AS acceptances,
        COUNT(*) FILTER (WHERE e.event_type = 'SALE_COLLAPSED')::int AS collapses
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.timestamp BETWEEN $2 AND $3`,
        [agentId, fromIso, toIso]
    );
    const activity = activityResult.rows[0];

    const collapseReasonsResult = await pool.query<{ reason: string | null; count: number }>(
        `SELECT e.details->>'reason' AS reason, COUNT(*)::int AS count
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type = 'SALE_COLLAPSED'
        AND e.timestamp BETWEEN $2 AND $3
        GROUP BY e.details->>'reason'
        ORDER BY count DESC`,
        [agentId, fromIso, toIso]
    );

    // How successfully are clients being won? New listings per month 
    const listingsByMonthResult = await pool.query<{ month: Date; count: number }>(
        `SELECT date_trunc('month', e.timestamp) AS month, COUNT(*)::int AS count
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type = 'LISTING_CREATED'
        AND e.timestamp BETWEEN $2 AND $3
        GROUP BY date_trunc('month', e.timestamp)
        ORDER BY month ASC`,
        [agentId, fromIso, toIso]
    );

    // What does a collapse cost? Days between acceptance and collapse.
    const daysLostResult = await pool.query<{ avg_days_lost: number | null }>(
        `SELECT AVG(days_lost)::float AS avg_days_lost FROM (
        SELECT EXTRACT(EPOCH FROM (col.timestamp - acc.max_ts)) / 86400 AS days_lost
        FROM events col
        JOIN properties p ON p.property_id = col.property_id
        JOIN LATERAL (
        SELECT MAX(a.timestamp) AS max_ts
        FROM events a
        WHERE a.property_id = col.property_id AND a.event_type = 'BID_ACCEPTED'
        AND a.timestamp < col.timestamp
        ) acc ON acc.max_ts IS NOT NULL
        WHERE p.agent_id = $1 AND col.event_type = 'SALE_COLLAPSED'
        AND col.timestamp BETWEEN $2 AND $3
        ) per_collapse`,
        [agentId, fromIso, toIso]
    );

    // How does relisting after collapse impact price?
    const relistDiscountResult = await pool.query<{ avg_discount: number | null }>(
        `SELECT AVG(1 - (e.details->>'new_asking_price')::numeric / (e.details->>'previous_asking_price')::numeric)::float AS avg_discount
        FROM events e
        JOIN properties p ON p.property_id = e.property_id
        WHERE p.agent_id = $1 AND e.event_type = 'PROPERTY_RELISTED'
        AND e.timestamp BETWEEN $2 AND $3`,
        [agentId, fromIso, toIso]
    );

    return {
        averageDaysToAgreed: durationResult.rows[0].avg_days,
        averageDaysToFirstBid: firstBidResult.rows[0].avg_days,
        averageRatio: ratioResult.rows[0].avg_ratio,
        averageBidsPerListing: bidsPerListingResult.rows[0].avg_bids,
        acceptances: activity.acceptances,
        collapses: activity.collapses,
        collapseReasons: collapseReasonsResult.rows,
        listingsByMonth: listingsByMonthResult.rows,
        averageDaysLostToCollapse: daysLostResult.rows[0].avg_days_lost,
        averageRelistDiscount: relistDiscountResult.rows[0].avg_discount,
    };
}

/**
 * Parses a YYYY-MM-DD input into a safe date, falling back on the default.
 */
export function parseDateParam(raw: string | undefined, fallback: Date): Date {
    if (typeof raw !== "string" || raw === "") {
        return fallback;
    }
    const parsed = new Date(raw + "T00:00:00.000Z");
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }
    if (parsed.toISOString().slice(0, 10) !== raw) {
        return fallback;
    }
    return parsed;
}