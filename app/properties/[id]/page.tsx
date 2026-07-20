import pool from "@/lib/db";
import { Property } from "@/lib/types";
import { notFound } from "next/navigation";
import { listingTypeLabel, formatPrice, featuresLine } from "@/lib/format";
import BidForm from "@/components/bid-form";
import { auth } from "@/auth";
import { canBidOn } from "@/lib/permissions";


type PropertyRouteParams = {
    id: string;
}
type PropertyPageProps = {
    params: Promise<PropertyRouteParams>
}

export default async function PropertyPage(props: PropertyPageProps) {

    const params = await props.params;
    const propertyId = Number(params.id);

    if (Number.isNaN(propertyId)) {
        notFound();
    }

    const result = await pool.query<Property>(`
    SELECT * FROM properties 
    WHERE properties.property_id = $1`,
        [propertyId]);

    const property = result.rows[0];

    if (property === undefined) {
        notFound();
    }

    let imageSrc;
    if (property.image_path === null) {
        imageSrc = "/placeholder.jpg";
    } else {
        imageSrc = property.image_path;
    }

    let addressLine;
    if (property.address_line_2 === null) {
        addressLine = property.address_line_1;
    } else {
        addressLine = property.address_line_1 + ", " + property.address_line_2;
    }

    let descriptionLine;
    if (property.description === null) {
        descriptionLine = null;
    } else {
        descriptionLine = <p className="max-w-prose">{property.description}</p>;
    }

    const session = await auth();

    let canBid = false;
    if (session !== null && session.user.role === "bidder") {
        canBid = await canBidOn(property.property_id, Number(session.user.id));
    }

    let biddingSection;
    if (canBid) {
        biddingSection = <BidForm propertyId={property.property_id} />;
    } else {
        biddingSection = (
            <p className="text-sm text-gray-500">Bidding is open to invited participants.</p>
        );
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <img src={imageSrc} className="h-96 w-full object-cover rounded-xl" alt={property.address_line_1 + ", " + property.city} />
            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold text-brand">{addressLine}</h1>
                        <p className="text-gray-600">{property.city}, {property.postcode}</p>
                        <p className="text-sm text-gray-600">{featuresLine(property.bedrooms, property.bathrooms, property.receptions)}</p>
                    </div>
                    {descriptionLine}
                </div>
                <div>
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">{listingTypeLabel(property.listing_type)}</p>
                        <p className="text-3xl font-semibold text-brand">{formatPrice(property.asking_price)}</p>
                        <div className="mt-4 border-t border-slate-200 pt-4">
                            {biddingSection}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );

}