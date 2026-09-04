"use client";

import { useActionState } from "react";
import { placeBid } from "../lib/actions/bids";

type BidFormProps = {
    propertyId: number;
    defaultPosition: string | null;
    defaultFunding: string | null;
    defaultFlags: string[];
    defaultNote: string | null;
};

const POSITION_OPTIONS = [
    { value: "ftb", label: "First-time buyer" },
    { value: "chain", label: "In a chain" },
    { value: "no_chain", label: "Not in a chain" },
];

const FUNDING_OPTIONS = [
    { value: "cash", label: "Cash" },
    { value: "mortgage", label: "Mortgage" },
    { value: "co_ownership", label: "Co-Ownership scheme" },
];

const CONDITION_OPTIONS = [
    { value: "subject_to_survey", label: "Subject to survey" },
    { value: "flexible_completion", label: "Flexible on completion date" },
];

/**
 * Bid form with amount, position and funding vocabularies, and condition flags.
 */
export default function BidForm(props: BidFormProps) {
    const placeBidForProperty = placeBid.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(placeBidForProperty, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
            </p>
        );
    } else if (state !== null && "success" in state) {
        feedback = (
            <p className="rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                Your bid has been placed.
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Placing bid...";
    } else {
        buttonLabel = "Place bid";
    }

    return (
        <form action={action} className="space-y-4">
            {feedback}

            <label className="block text-sm font-medium">
                Your bid (£)
                <input name="amount" type="number" min="1" step="1" required className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>

            <details className="group rounded border border-slate-200 p-3" open={props.defaultFunding === null}>
                <summary className="cursor-pointer list-none text-sm">
                    <span className="font-medium">Your terms</span>
                    {props.defaultFunding !== null && (
                        <span className="ml-2 text-xs text-gray-500 group-open:hidden">
                            {[
                                FUNDING_OPTIONS.find((option) => option.value === props.defaultFunding)?.label,
                                POSITION_OPTIONS.find((option) => option.value === props.defaultPosition)?.label,
                                ...CONDITION_OPTIONS.filter((option) => props.defaultFlags.includes(option.value)).map((option) => option.label),
                            ].filter((part) => part !== undefined).join(" · ")}
                            <span className="ml-2 text-action underline">Change</span>
                        </span>
                    )}
                </summary>
                <div className="mt-3 space-y-4">
                    <fieldset className="space-y-1">
                        <legend className="text-sm font-medium">Your position</legend>
                        {POSITION_OPTIONS.map((option) => (
                            <label key={option.value} className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="buyer_position"
                                    value={option.value}
                                    required
                                    defaultChecked={props.defaultPosition === option.value}
                                />
                                {option.label}
                            </label>
                        ))}
                    </fieldset>

                    <fieldset className="space-y-1">
                        <legend className="text-sm font-medium">Funding</legend>
                        {FUNDING_OPTIONS.map((option) => (
                            <label key={option.value} className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="funding"
                                    value={option.value}
                                    required
                                    defaultChecked={props.defaultFunding === option.value}
                                />
                                {option.label}
                            </label>
                        ))}
                    </fieldset>

                    <fieldset className="space-y-1">
                        <legend className="text-sm font-medium">Conditions</legend>
                        {CONDITION_OPTIONS.map((option) => (
                            <label key={option.value} className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    name="condition_flags"
                                    value={option.value}
                                    defaultChecked={props.defaultFlags.includes(option.value)}
                                />
                                {option.label}
                            </label>
                        ))}
                    </fieldset>

                    <label className="block text-sm font-medium">
                        Anything else (optional)
                        <textarea name="note" rows={2} defaultValue={props.defaultNote ?? ""} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                        <span className="mt-1 block text-xs font-normal text-gray-500">
                            Permanently recorded and visible to the vendor and agent - don&apos;t include personal or sensitive information.
                        </span>
                    </label>
                </div>
            </details>

            <button type="submit" disabled={pending} className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}