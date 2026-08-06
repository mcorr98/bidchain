"use client";
import { useActionState } from "react";
import { relistProperty } from "@/lib/actions/lifecycle";

type RelistFormProps = {
    propertyId: number;
    currentAskingPricePounds: number;
};

export default function RelistForm(props: RelistFormProps) {
    const relistThisProperty = relistProperty.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(relistThisProperty, null);

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
        buttonLabel = "Relisting...";
    } else {
        buttonLabel = "Relist property";
    }

    return (
        <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Relist property
            </h2>
            <p className="text-sm text-gray-500">
                Bidding reopens at the price below. Previous participants will lose access and must be re-invited.
            </p>
            <form action={action} className="space-y-3">
                {feedback}
                <label className="block text-sm font-medium">
                    Asking price (£)
                    <input name="asking_price" type="number" min="1" step="1" required defaultValue={props.currentAskingPricePounds} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <button type="submit" disabled={pending} className="rounded bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-strong disabled:opacity-50">
                    {buttonLabel}
                </button>
            </form>
        </div>
    );
}