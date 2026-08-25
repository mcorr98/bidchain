"use client";
import { useActionState } from "react";
import { replaceVendorInvitation } from "@/lib/actions/lifecycle";

type ReplaceVendorFormProps = {
    propertyId: number;
    currentEmail: string | null;
    vendorJoined: boolean;
};

export default function ReplaceVendorForm(props: ReplaceVendorFormProps) {
    const boundAction = replaceVendorInvitation.bind(null, props.propertyId);
    const [state, action, pending] = useActionState(boundAction, null);

    let buttonLabel: string;
    if (pending) {
        buttonLabel = "Sending...";
    } else if (props.vendorJoined) {
        buttonLabel = "Replace vendor";
    } else {
        buttonLabel = "Send invitation";
    }

    return (
        <form action={action} className="space-y-2">
            {state !== null && "error" in state && (
                <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
            )}
            {state !== null && "success" in state && (
                <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">Vendor invitation updated</p>
            )}
            <label className="block text-sm font-medium" htmlFor="vendor_email">Vendor email</label>
            <input id="vendor_email" name="vendor_email" type="email" required defaultValue={props.currentEmail ?? ""} className="w-full rounded border border-gray-300 bg-white px-3 py-2" />
            {props.vendorJoined && (
                <p className="text-xs text-amber-700">Replacing the vendor removes the current vendor&apos;s access to this draft.</p>
            )}
            <button type="submit" disabled={pending} className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}