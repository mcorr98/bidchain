"use client"
import { useActionState } from "react";
import { createListing } from "@/lib/actions/lifecycle";

/**
 * Agent form that creates a new draft listing.
 */
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
        buttonLabel = "Creating listing...";
    } else {
        buttonLabel = "Create listing";
    }

    return (
        <form action={action} className="space-y-4">
            {feedback}

            <label className="block text-sm font-medium">
                Vendor email
                <input name="vendor_email" type="email" required defaultValue={state?.values?.vendor_email} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                    Address line 1
                    <input name="address_line_1" required defaultValue={state?.values?.address_line_1} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Address line 2 (optional)
                    <input name="address_line_2" defaultValue={state?.values?.address_line_2} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    City
                    <input name="city" required defaultValue={state?.values?.city} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Postcode
                    <input name="postcode" required defaultValue={state?.values?.postcode} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                    Asking price (£)
                    <input name="asking_price" type="number" min="1" step="1" required defaultValue={state?.values?.asking_price} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Listing type
                    <select name="listing_type" required defaultValue={state?.values?.listing_type ?? ""} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2">
                        <option value="" disabled>Choose...</option>
                        <option value="offers_over">Offers over</option>
                        <option value="offers_around">Offers around</option>
                        <option value="fixed_price">Fixed price</option>
                    </select>
                </label>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <label className="block text-sm font-medium">
                    Bedrooms
                    <input name="bedrooms" type="number" min="0" step="1" defaultValue={state?.values?.bedrooms} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Bathrooms
                    <input name="bathrooms" type="number" min="0" step="1" defaultValue={state?.values?.bathrooms} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium">
                    Receptions
                    <input name="receptions" type="number" min="0" step="1" defaultValue={state?.values?.receptions} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </label>
            </div>
            <label className="block text-sm font-medium" htmlFor="listing_url">
                External listing link (optional)
                <input id="listing_url" name="listing_url" type="url" placeholder="https://www.propertypal.com/..." defaultValue={state?.values?.listing_url} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium" htmlFor="image">
                Photo (optional)
            </label>
            <input id="image" name="image" type="file" accept=".jpg,.jpeg,.png,.webp" className="block w-full cursor-pointer text-sm text-gray-500 file:mr-3 file:cursor-pointer file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-slate-50 file:border-solid" />
            <button type="submit" disabled={pending} className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong disabled:opacity-50">
                {buttonLabel}
            </button>
        </form>
    );
}