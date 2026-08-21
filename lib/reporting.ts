import pool from "@/lib/db";

export type ReportMetrics = {
    averageDaysToAgreed: number | null;
    averageRatio: number | null;
    averageBidsPerListing: number | null;
    acceptances: number;
    collapses: number;
    bidsWithinPeriod: number;
    collapseReasons: { reason: string | null; count: number }[];
    bidsByMonth: { month: Date; count: number }[];
};

/**
 * Calculates the agency's business metrics between a chosen date range. Figures derived from event change to
 * prevent diverging metrics 
 * @param agentId - the agency 
 * @param fromIso - report start date
 * @param toIso - report end date
 */
export async function getReportMetrics(agentId: number, fromIso: string, toIso: string): Promise<ReportMetrics> {

    // Days from publication to acceptance withing period 
    const durationResult = await pool.query<{ avg_days: number | null }>(
        `SELECT AVG(days)::float AS avg_days FROM (
        SELECT EXTRACT(EPOCH FROM (MIN(acc.timestamp) - MIN(gen.timestamp))) / 86400 AS days
        FROM properties p
        JOIN events gen ON gen.property_id = p.property_id AND gen.event_type = 'LISTING_CREATED'
        JOIN events acc ON acc.property_id = p.property_id AND acc.event_type = 'BID_ACCEPTED'
        WHERE p.agent_id = $1
        GROUP BY p.property_id
        HAVING MIN(acc.timestamp) BETWEEN $2 AND $3
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
        ) per_property`,
        [agentId, fromIso, toIso]
    );

    // Outcome counts in one pass.
    const activityResult = await pool.query<{ acceptances: number; collapses: number; bids_in_period: number }>(
        `SELECT
        COUNT(*) FILTER (WHERE e.event_type = 'BID_ACCEPTED')::int AS acceptances,
        COUNT(*) FILTER (WHERE e.event_type = 'SALE_COLLAPSED')::int AS collapses,
        COUNT(*) FILTER (WHERE e.event_type IN ('BID_PLACED', 'BID_REVISED'))::int AS bids_in_period
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

    const bidsByMonthResult = await pool.query<{ month: Date; count: number }>(
    `SELECT date_trunc('month', e.timestamp) AS month, COUNT(*)::int AS count
    FROM events e
    JOIN properties p ON p.property_id = e.property_id
    WHERE p.agent_id = $1 AND e.event_type IN ('BID_PLACED', 'BID_REVISED')
    AND e.timestamp BETWEEN $2 AND $3
    GROUP BY date_trunc('month', e.timestamp)
    ORDER BY month ASC`,
    [agentId, fromIso, toIso]
    );

    return {
        averageDaysToAgreed: durationResult.rows[0].avg_days,
        averageRatio: ratioResult.rows[0].avg_ratio,
        averageBidsPerListing: bidsPerListingResult.rows[0].avg_bids,
        acceptances: activity.acceptances,
        collapses: activity.collapses,
        bidsWithinPeriod: activity.bids_in_period,
        collapseReasons: collapseReasonsResult.rows, 
        bidsByMonth: bidsByMonthResult.rows
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