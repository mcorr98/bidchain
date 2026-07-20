"use client";

import { useActionState } from "react";
import { placeBid } from "../lib/actions/bids";

type BidFormProps = {
    propertyId: number;
};

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
        buttonLabel = "Placing bid…";
    } else {
        buttonLabel = "Place bid";
    }

    return (
        <form action={action} className="space-y-3">
            {feedback}

            <label className="block text-sm font-medium">
                Your offer (£)
                <input
                    name="amount"
                    type="number"
                    min="1"
                    step="1"
                    required
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2"
                />
            </label>

            <label className="block text-sm font-medium">
                Conditions (optional)
                <textarea
                    name="conditions"
                    rows={2}
                    placeholder="e.g. Subject to survey"
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2"
                />
            </label>

            <button
                type="submit"
                disabled={pending}
                className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50"
            >
                {buttonLabel}
            </button>
        </form>
    );
}