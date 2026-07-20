import pool from "@/lib/db";
import Link from "next/link";
import { formatPrice, listingTypeLabel, featuresLine } from "@/lib/format";
import { Property } from "@/lib/types";
import { auth } from "@/auth";
import { redirect } from "next/navigation";


/**
 * "Listings" page which can be viewed by a logged in agent. It displays a grid of the properties they are currently managing
 * @returns - listings page content HTML
 */
export default async function AgentListingsPage() {

    const session = await auth();
    if (!session || session.user.role !== "agent") {
        redirect("/login");
    }
    const result = await pool.query<Property>(`
        SELECT p.property_id, p.address_line_1, p.city, p.postcode, p.listing_type, p.asking_price, p.image_path, p.bedrooms, p.bathrooms, p.receptions
        FROM properties p 
        WHERE p.agent_id = $1`,
        [Number(session.user.id)]);

    const properties = result.rows;

    let content;
    if (properties.length === 0) {
        content = <p>You haven't listed any properties yet</p>
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
                        <img className="h-48 w-full object-cover" src={imageSrc} alt={property.address_line_1 + ", " + property.city} />
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
            <h1 className="mb-6 text-2xl font-semibold text-brand">My listings</h1>
            {content}
        </main>
    );
}
