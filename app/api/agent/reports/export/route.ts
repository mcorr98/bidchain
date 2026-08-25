import { auth } from "@/auth";
import { getReportMetrics, parseDateParam } from "@/lib/reporting";

export async function GET(request: Request) {
    const session = await auth();
    if (!session || session.user.role !== "agent") {
        return new Response("Unauthorised", { status: 401 });
    }
    const agentId = Number(session.user.id);

    const url = new URL(request.url);
    const defaultFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const fromDate = parseDateParam(url.searchParams.get("from") ?? undefined, defaultFrom);
    const toDate = parseDateParam(url.searchParams.get("to") ?? undefined, new Date());
    const fromValue = fromDate.toISOString().slice(0, 10);
    const toValue = toDate.toISOString().slice(0, 10);

    const metrics = await getReportMetrics(agentId, fromDate.toISOString(), toValue + "T23:59:59.999Z");

    const lines: string[] = [];
    lines.push("BidChain agency report");
    lines.push("Period," + fromValue + " to " + toValue);
    lines.push("");
    lines.push("Metric,Value");
    lines.push("Time to sale agreed (days)," + (metrics.averageDaysToAgreed === null ? "" : metrics.averageDaysToAgreed.toFixed(1)));
    lines.push("Achieved vs asking (%)," + (metrics.averageRatio === null ? "" : (metrics.averageRatio * 100).toFixed(1)));
    lines.push("Bids per listing," + (metrics.averageBidsPerListing === null ? "" : metrics.averageBidsPerListing.toFixed(1)));
    lines.push("Sales agreed," + metrics.acceptances);
    lines.push("Sales collapsed," + metrics.collapses);
    lines.push("Days to first bid," + (metrics.averageDaysToFirstBid === null ? "" : metrics.averageDaysToFirstBid.toFixed(1)));
    lines.push("Days lost per collapse," + (metrics.averageDaysLostToCollapse === null ? "" : metrics.averageDaysLostToCollapse.toFixed(1)));
    lines.push("Relist discount (%)," + (metrics.averageRelistDiscount === null ? "" : (metrics.averageRelistDiscount * 100).toFixed(1)));
    lines.push("");
    lines.push("Bidders at acceptance,Sales,Achieved vs asking (%)");
    lines.push("");
    lines.push("Collapse reason,Count");
    for (const row of metrics.collapseReasons) {
        lines.push((row.reason ?? "no reason given") + "," + row.count);
    }

    return new Response(lines.join("\n"), {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="bidchain-report-${fromValue}-to-${toValue}.csv"`,
        },
    });
}