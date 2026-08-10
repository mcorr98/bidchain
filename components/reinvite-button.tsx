"use client";
import { useActionState } from "react";
import { inviteBidder } from "@/lib/actions/participants";

type ReinviteButtonProps = {
    propertyId: number;
    email: string;
};

export default function ReinviteButton(props: ReinviteButtonProps) {
    const reinvite = inviteBidder.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(reinvite, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mt-1 text-xs text-red-700">{state.error}</p>
        );
    } else if (state !== null && "link" in state) {
        feedback = (
            <input readOnly value={state.link} onFocus={(e) => e.target.select()} className="mt-1 w-full rounded border border-teal-300 bg-white px-2 py-1 font-mono text-xs"/>
        );
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