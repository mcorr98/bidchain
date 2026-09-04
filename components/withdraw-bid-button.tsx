"use client";
import { useActionState } from "react";
import { withdrawBid } from "@/lib/actions/bids";

type WithdrawBidButtonProps = {
    propertyId: number;
    offerId: number;
};

/**
 * Bidder button that withdraws their own offer.
 */
export default function WithdrawBidButton(props: WithdrawBidButtonProps) {
    const withDrawThisBid = withdrawBid.bind(null, props.propertyId, props.offerId);
    const [state, action, pending] = useActionState(withDrawThisBid, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mt-1 text-xs text-red-700 ">{state.error}</p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Withdrawing...";
    } else {
        buttonLabel = "Withdraw bid";
    }

    return (
        <form action={action}>
            <button type="submit" disabled={pending} className="text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-50">
                {buttonLabel}
            </button>
            {feedback}
        </form>
    );
}