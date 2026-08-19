"use client";

import { useActionState } from "react";
import { collapseSale } from "@/lib/actions/lifecycle";

type CollapseSaleFormProps = {
    propertyId: number;
    initiator: "buyer" | "vendor";

};

export default function CollapseSaleForm(props: CollapseSaleFormProps) {
    const collapseThisSale = collapseSale.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(collapseThisSale, null);

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
        buttonLabel = "Withdrawing...";
    } else {
        buttonLabel = "Withdraw from this sale";
    }

    let reasonOptions;
    if (props.initiator === "buyer") {
        reasonOptions = (
            <>
                <option value="" disabled>Choose...</option>
                <option value="mortgage_declined">Mortgage declined</option>
                <option value="survey">Survey findings</option>
                <option value="chain_collapse">Chain collapsed</option>
                <option value="other">Other</option>
            </>
        );
    } else {
        reasonOptions = (
            <>
                <option value="" disabled>Choose...</option>
                <option value="chain_collapse">Chain collapsed</option>
                <option value="no_longer_selling">No longer selling</option>
                <option value="other">Other</option>
            </>
        );
    }

    return (
        <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Withdraw from sale
            </h2>
            <form action={action} className="space-y-3">
                {feedback}
                <label className="block text-sm font-medium">
                    Reason
                    <select name="reason" required defaultValue="" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2">
                        {reasonOptions}
                    </select>
                </label>
                <button type="submit" disabled={pending} className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                    {buttonLabel}
                </button>
            </form>
        </div>
    );
}