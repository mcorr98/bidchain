import type { LucideIcon } from "lucide-react";

type SectionHeadingProps = {
    icon: LucideIcon;
    label: string;
};

/**
 * Small labelled heading used to title page sections.
 */
export default function SectionHeading(props: SectionHeadingProps) {
    const Icon = props.icon;
    return (
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <Icon className="h-4 w-4" />
            {props.label}
        </h2>
    );
}