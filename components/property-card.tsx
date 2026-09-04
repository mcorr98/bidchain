import Link from "next/link";
import { formatPrice, listingTypeLabel, featuresLine } from "@/lib/format";
import { Property } from "@/lib/types";

type PropertyCardProps = {
    property: Property;
};

/**
 * Card summarising a property for grid views.
 */
export default function PropertyCard(props: PropertyCardProps) {
    const property = props.property;

    let imageArea;
    if (property.image_path === null) {
        imageArea = (
            <div className="flex h-48 w-full items-center justify-center bg-slate-100">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Photo to follow
                </span>
            </div>
        );
    } else {
        imageArea = (
            <img src={property.image_path} alt={property.address_line_1 + ", " + property.city} className="h-48 w-full object-cover" />
        );
    }

    let stateBadge = null;
    if (property.state === "draft") {
        stateBadge = (
            <span className="absolute top-2 right-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white">
                draft
            </span>
        );
    } else if (property.state !== "open") {
        stateBadge = (
            <span className="absolute top-2 right-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white">
                {property.state}
            </span>
        );
    }

    return (
        <Link href={`/properties/${property.property_id}`} className="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="relative">
                {imageArea}
                {stateBadge}
            </div>
            <div className="p-4">
                <h2 className="font-semibold">{property.address_line_1}</h2>
                <p className="text-sm text-gray-500">{property.city} · {property.postcode}</p>
                <p className="mt-2 text-lg font-semibold text-brand">
                    {listingTypeLabel(property.listing_type)} {formatPrice(property.asking_price)}
                </p>
                <p className="text-sm text-gray-600">{featuresLine(property.bedrooms, property.bathrooms, property.receptions)}</p>
            </div>
        </Link>
    );
}