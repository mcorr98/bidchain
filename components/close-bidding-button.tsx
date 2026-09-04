"use client"

import { useActionState } from "react";
import { closeBidding } from "@/lib/actions/lifecycle";

type CloseBiddingButtonProps = {
    propertyId: number;
};

/**
 * Agent button that closes bidding on a property.
 */
export default function CloseBiddingButton(props: CloseBiddingButtonProps) {
    const closeBiddingForProperty = closeBidding.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(closeBiddingForProperty, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Closing...";
    } else {
        buttonLabel = "Close bidding";
    }

    return (
        <form action={action} className="space-y-3">
            {feedback}
            <button
                type="submit"
                disabled={pending}
                className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}