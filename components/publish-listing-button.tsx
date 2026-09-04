"use client";
import { useActionState } from "react";
import { publishListing } from "@/lib/actions/lifecycle";

type PublishListingButtonProps = {
    propertyId: number;
};

/**
 * Agent button that publishes a draft listing once the vendor has joined.
 */
export default function PublishListingButton(props: PublishListingButtonProps) {
    const publishForProperty = publishListing.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(publishForProperty, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Publishing...";
    } else {
        buttonLabel = "Publish listing";
    }

    return (
        <form action={action}>
            <button type="submit" disabled={pending} className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
            {feedback}
        </form>
    );
}