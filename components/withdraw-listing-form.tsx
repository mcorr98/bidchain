"use client";
import { useActionState } from "react";
import { withdrawListing } from "@/lib/actions/lifecycle";

type WithdrawListingFormProps = {
    propertyId: number;
};

export default function WithdrawListingForm(props: WithdrawListingFormProps) {
    const withdrawThisListing = withdrawListing.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(withdrawThisListing, null);

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
        buttonLabel = "Withdraw listing";
    }

    return (
        <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Withdraw listing
            </h2>
            <p className="text-sm text-gray-500">
                Takes the property off the market. Any live offers expire. The event record is kept.
            </p>
            <form action={action} className="space-y-3">
                {feedback}
                <label className="block text-sm font-medium">
                    Reason (optional)
                    <textarea name="reason" rows={2} placeholder="e.g. Vendor no longer selling"
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <button type="submit" disabled={pending}
                    className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                        {buttonLabel}
                </button>
            </form>
        </div>
    );
}