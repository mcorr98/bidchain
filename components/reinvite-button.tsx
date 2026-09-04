"use client";
import { useActionState } from "react";
import { inviteBidder } from "@/lib/actions/participants";

type ReinviteButtonProps = {
    propertyId: number;
    email: string;
};

/**
 * Agent button that re-sends a lapsed or expired invitation.
 */
export default function ReinviteButton(props: ReinviteButtonProps) {
    const reinvite = inviteBidder.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(reinvite, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mt-1 text-xs text-red-700">{state.error}</p>
        );
    } else if (state !== null && "success" in state) {
        if (state.emailed) {
            feedback = (
                <p className="mt-1 text-xs text-teal-700">Invitation emailed.</p>
            );
        } else {
            feedback = (
                <p className="mt-1 text-xs text-amber-700">Email failed to send - please try again.</p>
            );
        }
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Inviting...";
    } else {
        buttonLabel = "Re-invite";
    }

    return (
        <form action={action}>
            <input type="hidden" name="email" value={props.email} />
            <button type="submit" disabled={pending} className="text-xs text-action underline hover:text-action-strong">
                {buttonLabel}
            </button>
            {feedback}
        </form>
    );
}