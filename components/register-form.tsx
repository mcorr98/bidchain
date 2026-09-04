"use client";

import { useActionState } from "react";
import { registerAccount } from "@/lib/actions/accounts";

type RegisterFormProps = {
    nextPath: string;
    invitedEmail: string;
    inviteToken: string;
};

/**
 * Registration form for new accounts.
 */
export default function RegisterForm(props: RegisterFormProps) {
    const [state, action, pending] = useActionState(registerAccount, null);

    let feedback = null;
    if (state !== null && "error" in state) {
        feedback = (
            <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
            </p>
        );
    }

    let emailField;
    if (props.invitedEmail !== "") {
        emailField = (
            <label className="block text-sm font-medium">
                Email
                <input name="email" type="email" readOnly required defaultValue={props.invitedEmail} className="mt-1 w-full rounded border border-gray-300 bg-slate-50 px-3 py-2 text-gray-600" />
                <span className="mt-1 block text-xs font-normal text-gray-500">
                    This is the address your invitation was sent to.
                </span>
            </label>
        );
    } else {
        emailField = (
            <label className="block text-sm font-medium">
                Email
                <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Creating account...";
    } else {
        buttonLabel = "Create account";
    }

    return (
        <form action={action} className="space-y-4">
            {feedback}
            <input type="hidden" name="next" value={props.nextPath} />
            <input type="hidden" name="invite_token" value={props.inviteToken} />
            <label className="block text-sm font-medium">
                Full name
                <input name="name" required autoComplete="name" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            {emailField}
            <label className="block text-sm font-medium">
                Password
                <input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                <span className="mt-1 block text-xs font-normal text-gray-500">
                    At least 8 characters.
                </span>
            </label>
            <label className="block text-sm font-medium">
                Confirm password
                <input name="password_confirm" type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <button type="submit" disabled={pending} className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}