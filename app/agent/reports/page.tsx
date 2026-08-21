import { auth } from "@/auth";
import { redirect } from "next/navigation";
import StatCard from "@/components/stats-card";
import SectionHeading from "@/components/section-heading";
import { Timer, CircleAlert, ChartNoAxesColumn } from "lucide-react";
import { getReportMetrics, parseDateParam } from "@/lib/reporting";

type ReportsSearchParams = {
    from?: string;
    to?: string;
};

type ReportsPageProps = {
    searchParams: Promise<ReportsSearchParams>;
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
 * Agency reports: performance over a select time period derived from
 * the event chain
 */
export default async function AgentReportsPage(props: ReportsPageProps) {

    const session = await auth();
    if (!session || session.user.role !== "agent") {
        redirect("/login");
    }
    const agentId = Number(session.user.id);

    const params = await props.searchParams;
    const defaultFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const fromDate = parseDateParam(params.from, defaultFrom);
    const toDate = parseDateParam(params.to, new Date());

    const fromValue = fromDate.toISOString().slice(0, 10);
    const toValue = toDate.toISOString().slice(0, 10);
    // Inclusive end: the whole of the chosen end day.
    const toIso = toValue + "T23:59:59.999Z";

    const metrics = await getReportMetrics(agentId, fromDate.toISOString(), toIso);

    let daysLabel = "-";
    if (metrics.averageDaysToAgreed !== null) {
        daysLabel = metrics.averageDaysToAgreed.toFixed(1) + " days";
    }
    let ratioLabel = "-";
    if (metrics.averageRatio !== null) {
        ratioLabel = (metrics.averageRatio * 100).toFixed(1) + "%";
    }
    let bidsLabel = "-";
    if (metrics.averageBidsPerListing !== null) {
        bidsLabel = metrics.averageBidsPerListing.toFixed(1);
    }
    let collapseLabel = "-";
    if (metrics.acceptances > 0) {
        collapseLabel = Math.round((metrics.collapses / metrics.acceptances) * 100) + "%";
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <h1 className="text-2xl font-semibold text-brand">Reports</h1>
                <form method="get" className="flex items-end gap-2">
                    <label className="block text-xs font-medium text-gray-500">
                        From
                        <input type="date" name="from" defaultValue={fromValue} className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                    <label className="block text-xs font-medium text-gray-500">
                        To
                        <input type="date" name="to" defaultValue={toValue} className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                    <button type="submit" className="h-9 rounded border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50">
                        Apply
                    </button>
                    <a href={`/api/agent/reports/export?from=${fromValue}&to=${toValue}`} className="flex h-9 items-center rounded bg-action px-3 text-sm font-medium text-white hover:bg-action-strong">
                        Export CSV
                    </a>
                </form>
            </div>

            <div className="space-y-10">
                <div className="space-y-3">
                    <SectionHeading icon={Timer} label="Performance" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <StatCard label="Avg Time To Sale Agreed" value={daysLabel} />
                        <StatCard label="Achieved Vs Asking Price" value={ratioLabel} />
                        <StatCard label="Avg Bids Per Listing" value={bidsLabel} />
                        <StatCard label="Collapse Rate" value={collapseLabel} />
                        <StatCard label="Total Bids Within Period" value={String(metrics.bidsWithinPeriod)} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    <div className="space-y-3">
                        <SectionHeading icon={CircleAlert} label="Collapse reasons" />
                        {metrics.collapseReasons.length === 0 ? (
                            <p className="text-sm text-gray-500">No collapsed sales in this period.</p>
                        ) : (
                            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                                {metrics.collapseReasons.map((row) => (
                                    <li key={row.reason ?? "none"} className="flex items-center justify-between px-4 py-3">
                                        <p className="text-sm text-ink">{collapseReasonLabel(row.reason)}</p>
                                        <p className="text-sm font-semibold text-brand">{row.count}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="space-y-3 lg:col-span-2">
                        <SectionHeading icon={ChartNoAxesColumn} label="Bids per month" />
                        {metrics.bidsByMonth.length === 0 ? (
                            <p className="text-sm text-gray-500">No bids in this period.</p>
                        ) : (
                            <div className="rounded-xl border border-slate-200 bg-white p-6">
                                <div className="flex h-48 items-end gap-3">
                                    {metrics.bidsByMonth.map((bar) => {
                                        const max = Math.max(...metrics.bidsByMonth.map((b) => b.count));
                                        const heightPercent = Math.max((bar.count / max) * 100, 4);
                                        return (
                                            <div key={bar.month.toISOString()} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                                                <p className="text-xs font-semibold text-brand">{bar.count}</p>
                                                <div className="w-full rounded-t bg-indigo-400" style={{ height: heightPercent + "%" }} />
                                                <p className="text-xs text-gray-500">
                                                    {bar.month.toLocaleDateString("en-GB", { month: "short" })}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}