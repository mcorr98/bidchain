"use client";
import { useActionState } from "react";
import { acceptBid } from "@/lib/actions/lifecycle";

type AcceptBidButtonProps = {
    propertyId: number;
    offerId: number;
};

/**
 * Vendor button that accepts an offer on their property.
 */
export default function AcceptBidButton(props: AcceptBidButtonProps) {
    const acceptThisBid = acceptBid.bind(null, props.propertyId, props.offerId);
    const [state, action, pending] = useActionState(acceptThisBid, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mt-1 text-xs text-red-700">{state.error}</p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Accepting...";
    } else {
        buttonLabel = "Accept";
    }

    return (
        <form action={action}>
            <button type="submit" disabled={pending} className="rounded bg-action px-3 py-1 text-sm font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
            {feedback}
        </form>
    );
}