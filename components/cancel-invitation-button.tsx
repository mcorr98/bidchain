"use client";
import { useActionState } from "react";
import { cancelInvitation } from "@/lib/actions/participants";

type CancelInvitationButtonProps = {
    propertyId: number;
    email: string;
    label: string;
};

/**
 * Agent link that cancels an outstanding invitation and revokes its token.
 */
export default function CancelInvitationButton(props: CancelInvitationButtonProps) {
    const cancelThisInvitation = cancelInvitation.bind(null, props.propertyId, props.email);
    const [state, action, pending] = useActionState(cancelThisInvitation, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mt-1 text-xs text-red-700">{state.error}</p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Removing...";
    } else {
        buttonLabel = props.label;
    }

    return (
        <form action={action}>
            <button type="submit" disabled={pending} className="text-xs text-red-700 underline hover:text-red-800">
                {buttonLabel}
            </button>
            {feedback}
        </form>
    );
}
