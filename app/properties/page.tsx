import pool from "@/lib/db";
import Link from "next/link";
import { ListingType, formatPrice, listingTypeLabel, featuresLine } from "@/lib/format";

type Property = {
    property_id: number,
    vendor_id: number,
    agent_id: number,
    address_line_1: string,
    address_line_2: string | null,
    city: string,
    postcode: string,
    asking_price: number,
    bedrooms: number | null,
    bathrooms: number | null,
    receptions: number | null,
    description: string | null,
    image_path: string | null,
    listing_url: string | null,
    listing_type: ListingType,
    status: string,
    state: string,
    created_at: Date,
    updated_at: Date
}

export default async function PropertiesPage() {


    const result = await pool.query<Property>(`
        SELECT * FROM properties WHERE status = $1 ORDER BY created_at DESC`,
        ["active"]);

    const properties = result.rows;

    let content;
    if (properties.length === 0) {
        content = <p>No properties are currently listed</p>
    } else {
        content = <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => {
                let imageSrc;
                if (property.image_path === null) {
                    imageSrc = "/placeholder.jpg";
                } else {
                    imageSrc = property.image_path;
                }
                return (
                    <Link
                        key={property.property_id}
                        href={`/properties/${property.property_id}`}
                        className="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                        <img src={imageSrc} alt={property.address_line_1 + ", " + property.city} />
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
            })}
        </div>
    }
    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-brand">Properties for sale</h1>
            {content}
        </main>
    );
}