"use client"

import { useActionState } from "react";
import { inviteBidder } from "@/lib/actions/participants";

type InvitationFormProps = {
    propertyId: number;
};

export default function InvitationForm(props: InvitationFormProps) {
    const inviteParticipantToProperty = inviteBidder.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(inviteParticipantToProperty, null);

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
                Bidder invited to property.
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Inviting bidder...";
    } else {
        buttonLabel = "Invite bidder";
    }

    return (
        <form action={action} className="space-y-3">
            {feedback}

            <label className="block text-sm font-medium">
                Bidder email
                <input
                    name="email"
                    type="email"
                    required
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