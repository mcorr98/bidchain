import pool from "@/lib/db";
import Link from "next/link";
import { formatPrice, listingTypeLabel, featuresLine } from "@/lib/format";
import { Property } from "@/lib/types";
import { auth } from "@/auth";
import { redirect } from "next/navigation";


/**
 * "Properties" page which can be viewed by a logged in bidder. It displays a grid of the properties they are currently invited to / participating in 
 * @returns - proeprties page content HTML
 */
export default async function PropertiesPage() {

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    const result = await pool.query<Property>(
        `SELECT p.property_id, p.address_line_1, p.city, p.postcode, p.listing_type, p.asking_price, p.image_path, p.bedrooms, p.bathrooms, p.receptions, p.state
        FROM properties p 
        JOIN property_participants pp ON pp.property_id = p.property_id 
        WHERE pp.user_id = $1 AND pp.status = 'joined' AND p.state != 'draft' ORDER BY p.created_at DESC`,
        [session.user.id]);

    const properties = result.rows;

    let content;
    if (properties.length === 0) {
        content = <p>You haven't joined any properties yet</p>
    } else {
        content = <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => {
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
                        <img src={property.image_path} alt={property.address_line_1 + ", " + property.city}
                            className="h-48 w-full object-cover" />
                    );
                }

                let stateBadge = null;
                if (property.state !== "open") {
                    stateBadge = (
                        <span className="absolute top-2 right-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white">
                            {property.state}
                        </span>
                    );
                }

                return (
                    <Link key={property.property_id} href={`/properties/${property.property_id}`} className="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
            })}
        </div>
    }
    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-brand">My Properties</h1>
            {content}
        </main>
    );
}
