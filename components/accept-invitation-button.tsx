"use client";
import { useActionState } from "react";
import { acceptInvitation } from "@/lib/actions/participants";

type AcceptInvitationButtonProps = {
    token: string;
};

/**
 * Button that redeems an invitation token for the signed-in user.
 */
export default function AcceptInvitationButton(props: AcceptInvitationButtonProps) {
    const acceptThisInvitation = acceptInvitation.bind(null, props.token);
    const [state, action, pending] = useActionState(acceptThisInvitation, null);

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
        buttonLabel = "Accepting...";
    } else {
        buttonLabel = "Accept invitation";
    }

    return (
        <form action={action} className="space-y-3">
            {feedback}
            <button type="submit" disabled={pending} className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}