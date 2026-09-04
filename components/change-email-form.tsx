"use client";

import { useActionState } from "react";
import { changeEmail } from "@/lib/actions/accounts";

/**
 * Account form for changing email. Requires the current password.
 */
export default function ChangeEmailForm() {
    const [state, action, pending] = useActionState(changeEmail, null);

    let feedback = null;
    if (state !== null && state !== undefined && "error" in state) {
        feedback = (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Changing email...";
    } else {
        buttonLabel = "Change email";
    }

    return (
        <form action={action} className="space-y-4">
            {feedback}
            <label className="block text-sm font-medium">
                New email address
                <input name="new_email" type="email" required autoComplete="email"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">
                Current password
                <input name="current_password" type="password" required autoComplete="current-password"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <div className="space-y-1">
                <p className="text-xs text-gray-500">
                    You'&apos;ll be signed out - log back in using the new email address.
                </p>
                <p className="text-xs text-gray-500">
                    Any pending invitations that were sent to your old address will need to be sent again - estate agents can issue new invitations to their properties where needed.
                </p>
            </div>
            <button type="submit" disabled={pending}
                className="rounded bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}