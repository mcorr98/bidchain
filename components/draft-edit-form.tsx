"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateDraftListing } from "@/lib/actions/lifecycle";

const TRACKED_FIELDS = [
    "address_line_1", "address_line_2", "city", "postcode", "asking_price",
    "listing_type", "bedrooms", "bathrooms", "receptions", "listing_url",
];

type DraftDefaults = {
    address_line_1: string;
    address_line_2: string;
    city: string;
    postcode: string;
    asking_price_pounds: number;
    listing_type: string;
    bedrooms: number | null;
    bathrooms: number | null;
    receptions: number | null;
    listing_url: string;
};

type DraftEditFormProps = {
    propertyId: number;
    defaults: DraftDefaults;
    imagePath: string | null;
};

function fieldSnapshot(form: HTMLFormElement): string {
    const data = new FormData(form);
    const parts: string[] = [];
    for (const name of TRACKED_FIELDS) {
        parts.push(String(data.get(name) ?? ""));
    }
    const image = data.get("image");
    if (image instanceof File && image.size > 0) {
        parts.push(image.name + ":" + String(image.size));
    } else {
        parts.push("");
    }
    return parts.join("|");
}

export default function DraftEditForm(props: DraftEditFormProps) {
    const boundAction = updateDraftListing.bind(null, props.propertyId);
    const [state, formAction, pending] = useActionState(boundAction, null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const baselineRef = useRef<string | null>(null);
    const [dirty, setDirty] = useState(false);

    function captureForm(element: HTMLFormElement | null) {
        formRef.current = element;
        if (element !== null && baselineRef.current === null) {
            baselineRef.current = fieldSnapshot(element);
        }
    }

    function handleFormInput() {
        if (formRef.current === null || baselineRef.current === null) {
            return;
        }
        setDirty(fieldSnapshot(formRef.current) !== baselineRef.current);
    }

    // Save disables again until the agent changes something else.
    useEffect(() => {
        if (state !== null && "success" in state && formRef.current !== null) {
            baselineRef.current = fieldSnapshot(formRef.current);
            setDirty(false);
        }
    }, [state]);

    let saveLabel: string;
    if (pending) {
        saveLabel = "Saving...";
    } else {
        saveLabel = "Save changes";
    }

    return (
        <form ref={captureForm} action={formAction} onInput={handleFormInput} className="space-y-4">
            {state !== null && "error" in state && (
                <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
            )}
            {state !== null && "success" in state && !dirty && (
                <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Changes saved</p>
            )}

            <div>
                <label className="block text-sm font-medium">Address line 1</label>
                <input name="address_line_1" required defaultValue={props.defaults.address_line_1} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
            </div>
            <div>
                <label className="block text-sm font-medium">Address line 2</label>
                <input name="address_line_2" defaultValue={props.defaults.address_line_2} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">City</label>
                    <input name="city" required defaultValue={props.defaults.city} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Postcode</label>
                    <input name="postcode" required defaultValue={props.defaults.postcode} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Asking price (£)</label>
                    <input name="asking_price" type="number" min="1" step="1" required defaultValue={props.defaults.asking_price_pounds} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Listing type</label>
                    <select name="listing_type" required defaultValue={props.defaults.listing_type} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2">
                        <option value="offers_over">Offers over</option>
                        <option value="offers_around">Offers around</option>
                        <option value="fixed_price">Fixed price</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium">Bedrooms</label>
                    <input name="bedrooms" type="number" min="0" step="1" defaultValue={props.defaults.bedrooms ?? ""} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Bathrooms</label>
                    <input name="bathrooms" type="number" min="0" step="1" defaultValue={props.defaults.bathrooms ?? ""} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Receptions</label>
                    <input name="receptions" type="number" min="0" step="1" defaultValue={props.defaults.receptions ?? ""} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2" />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium" htmlFor="listing_url">Listing link</label>
                <input id="listing_url" name="listing_url" type="url" defaultValue={props.defaults.listing_url} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </div>

            <div>
                <span className="block text-sm font-medium">Photo</span>
                {props.imagePath !== null && (
                    <img src={props.imagePath} alt="Current listing photo" className="mt-2 h-40 w-auto rounded border border-slate-200 object-cover" />
                )}
                {props.imagePath === null && (
                    <p className="mt-2 text-sm text-gray-500">No photo yet</p>
                )}
                <label className="mt-2 block text-sm text-gray-600" htmlFor="image">Choose a file to replace it</label>
                <input id="image" name="image" type="file" accept=".jpg,.jpeg,.png,.webp" className="mt-1 block w-full cursor-pointer text-sm text-gray-500" />
            </div>

            <button type="submit" disabled={!dirty || pending} className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saveLabel}
            </button>
        </form>
    );
}