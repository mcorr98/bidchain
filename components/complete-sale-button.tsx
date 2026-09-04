"use client";

import { useActionState } from "react";
import { completeSale } from "@/lib/actions/lifecycle";

type CompleteSaleButtonProps = {
    propertyId: number;
};

/**
 * Agent button that records the sale completing.
 */
export default function CompleteSaleButton(props: CompleteSaleButtonProps) {
    const completeThisSale = completeSale.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(completeThisSale, null);

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
        buttonLabel = "Completing...";
    } else {
        buttonLabel = "Mark sale completed";
    }

    return (
        <form action={action} className="space-y-3">
            {feedback}
            <button type="submit" disabled={pending} className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}