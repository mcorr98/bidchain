"use client"

import { useActionState } from "react";
import { inviteVendor } from "@/lib/actions/accounts";

export default function InviteVendorForm() {
    const [state, action, pending] = useActionState(inviteVendor, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
            </p>
        );
    } else if (state !== null && "success" in state) {
        if (state.emailed) {
            feedback = (
                <p className="rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                    Invitation emailed to {state.email}.
                </p>
            );
        } else {
            feedback = (
                <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    The invitation email couldn&apos;t be sent - try inviting again.
                </p>
            );
        }
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Inviting...";
    } else {
        buttonLabel = "Invite";
    }

    return (
        <div className="space-y-2">
            {feedback}
            <form action={action} className="flex items-center gap-2">
                <label htmlFor="vendor-email" className="sr-only">Vendor email</label>
                <input id="vendor-email" name="email" type="email" required placeholder="Invite vendor by email" className="h-9 flex-1 rounded border border-slate-300 px-3 text-sm" />
                <button type="submit" disabled={pending} className="h-9 rounded bg-action px-4 text-sm font-medium text-white hover:bg-action-strong disabled:opacity-50">
                    {buttonLabel}
                </button>
            </form>
        </div>
    );
}