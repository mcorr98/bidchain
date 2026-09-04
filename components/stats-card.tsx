import Link from "next/link";
import { ChevronRight } from "lucide-react";

type StatCardProps = {
    label: string;
    value: string;
    href?: string;
};

/**
 * Dashboard card showing one headline metric.
 */
export default function StatCard(props: StatCardProps) {
    if (props.href === undefined) {
        return (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-gray-500">{props.label}</p>
                <p className="text-2xl font-semibold text-brand">{props.value}</p>
            </div>
        );
    }

    return (
        <Link href={props.href} className="group flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
            <p className="text-sm text-gray-500">{props.label}</p>
            <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold text-brand">{props.value}</p>
                <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-action" />
            </div>
        </Link>
    );
}