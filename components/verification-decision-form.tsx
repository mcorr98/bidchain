"use client";
import { useActionState } from "react";
import { decideVerification } from "@/lib/actions/verification";

type DecisionFormProps = {
    bidderId: number;
    documentHash: string;
};

/**
 * Agent form that approves or rejects a bidder's identity document.
 */
export default function VerificationDecisionForm(props: DecisionFormProps) {
    const decideForBidder = decideVerification.bind(null, props.bidderId);
    const [state, action, pending] = useActionState(decideForBidder, null);

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
                Decision recorded.
            </p>
        );
    }

    return (
        <form action={action} className="space-y-2">
            {feedback}
            <input type="hidden" name="reviewed_hash" value={props.documentHash} />
            <label className="block text-xs font-medium text-gray-500" htmlFor={`reason-${props.bidderId}`}>
                Reason (required if rejecting)
            </label>
            <input
                id={`reason-${props.bidderId}`}
                name="reason"
                type="text"
                placeholder="e.g. document illegible"
                className="block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />

            <div className="flex gap-2">
                <button
                    type="submit"
                    name="decision"
                    value="verified"
                    disabled={pending}
                    className="rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                    Approve
                </button>
                <button
                    type="submit"
                    name="decision"
                    value="rejected"
                    disabled={pending}
                    className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                    Reject
                </button>
            </div>
        </form>
    );
}