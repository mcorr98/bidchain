"use client";
import { useActionState } from "react";
import { changePassword } from "@/lib/actions/accounts";

/**
 * Account form for changing password. Requires the current password.
 */
export default function ChangePasswordForm() {
    const [state, action, pending] = useActionState(changePassword, null);

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
                Password updated.
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Updating...";
    } else {
        buttonLabel = "Update password";
    }

    return (
        <form action={action} className="space-y-4">
            {feedback}
            <label className="block text-sm font-medium">
                Current password
                <input name="current_password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">
                New password
                <input name="new_password" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">
                Confirm new password
                <input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <button type="submit" disabled={pending} className="rounded bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}