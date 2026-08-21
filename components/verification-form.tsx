"use client";

import { useActionState } from "react";
import { submitVerification } from "../lib/actions/verification";
import type { VerificationFormState } from "../lib/actions/verification";

const initialState: VerificationFormState = { status: "idle", message: "" };

export default function VerificationForm() {
    const [state, action, pending] = useActionState(submitVerification, initialState);

    let feedback = null;
    if (state.status === "error") {
        feedback = (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.message}
            </p>
        );
    } else if (state.status === "success") {
        feedback = (
            <p className="rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                {state.message}
            </p>
        );
    }

    let buttonLabel;
    if (pending) {
        buttonLabel = "Uploading...";
    } else {
        buttonLabel = "Submit for review";
    }

    return (
        <form action={action} className="space-y-3">
            {feedback}

            <label className="block text-sm font-medium" htmlFor="document">
                Photo ID (passport or driving licence)
            </label>
            <input
                id="document"
                name="document"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                required
                className="block w-full cursor-pointer text-sm text-gray-500 file:mr-3 file:cursor-pointer file:rounded file:border file:border-slate-300 file:border-solid file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-slate-50"
            />

            <button
                type="submit"
                disabled={pending}
                className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
                {buttonLabel}
            </button>
        </form>
    );
}
