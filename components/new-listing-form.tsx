"use client"
import { useActionState } from "react";
import { createListing } from "@/lib/actions/lifecycle";

export default function NewListingForm() {
    const [state, action, pending] = useActionState(createListing, null);

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
        buttonLabel = "Creating listing…";
    } else {
        buttonLabel = "Create listing";
    }

    return (
        <form action={action} className="space-y-4">
            {feedback}

            <label className="block text-sm font-medium">
                Vendor email
                <input name="vendor_email" type="email" required className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                <span className="mt-1 block text-xs font-normal text-gray-500">
                    The vendor must already have an account.
                </span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                    Address line 1
                    <input name="address_line_1" required className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Address line 2 (optional)
                    <input name="address_line_2" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    City
                    <input name="city" required className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Postcode
                    <input name="postcode" required className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                    Asking price (£)
                    <input name="asking_price" type="number" min="1" step="1" required className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Listing type
                    <select name="listing_type" required defaultValue="" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2">
                        <option value="" disabled>Choose…</option>
                        <option value="offers_over">Offers over</option>
                        <option value="offers_around">Offers around</option>
                        <option value="fixed_price">Fixed price</option>
                    </select>
                </label>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <label className="block text-sm font-medium">
                    Bedrooms
                    <input name="bedrooms" type="number" min="0" step="1" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Bathrooms
                    <input name="bathrooms" type="number" min="0" step="1" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Receptions
                    <input name="receptions" type="number" min="0" step="1" className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
            </div>

            <label className="block text-sm font-medium">
                Description (optional)
                <textarea name="description" rows={4} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
            </label>

            <button type="submit" disabled={pending} className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}