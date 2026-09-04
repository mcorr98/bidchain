import pool from "@/lib/db";
import { Property } from "@/lib/types";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasBidderProfile, hasVendorProfile } from "@/lib/permissions";
import PropertyCard from "@/components/property-card";
import SectionHeading from "@/components/section-heading";
import { HandCoins, House } from "lucide-react";

/**
 * Bidder's property list, split by bidding and watching.
 */
export default async function PropertiesPage() {

    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    const userId = Number(session.user.id);

    const showPropertiesBidder = await hasBidderProfile(userId);
    const showPropertiesVendor = await hasVendorProfile(userId);

    let bidderSection = null;
    if (showPropertiesBidder) {
        const biddingResult = await pool.query<Property>(
            `SELECT p.property_id, p.address_line_1, p.city, p.postcode, p.listing_type, p.asking_price, p.image_path, p.bedrooms, p.bathrooms, p.receptions, p.state
            FROM properties p
            JOIN property_participants pp ON pp.property_id = p.property_id
            WHERE pp.user_id = $1 AND pp.status = 'joined' AND p.state != 'draft'
            ORDER BY p.created_at DESC`,
            [userId]
        );

        let biddingContent;
        if (biddingResult.rows.length === 0) {
            biddingContent = <p className="text-sm text-gray-500">Properties you're bidding on will appear here once you accept an invitation to bid.</p>;
        } else {
            biddingContent = (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {biddingResult.rows.map((property) => (
                        <PropertyCard key={property.property_id} property={property} />
                    ))}
                </div>
            );
        }
        bidderSection = (
            <div className="space-y-3">
                <SectionHeading icon={HandCoins} label="Bidding" />
                {biddingContent}
            </div>
        );
    }

    let vendorSection = null;
    if (showPropertiesVendor) {
        const sellingResult = await pool.query<Property>(
            `SELECT p.property_id, p.address_line_1, p.city, p.postcode, p.listing_type, p.asking_price, p.image_path, p.bedrooms, p.bathrooms, p.receptions, p.state
            FROM properties p
            WHERE p.vendor_id = $1
            ORDER BY p.created_at DESC`,
            [userId]
        );

        let sellingContent;
        if (sellingResult.rows.length === 0) {
            sellingContent = <p className="text-sm text-gray-500">No properties yet. Your agent lists property against your account.</p>;
        } else {
            sellingContent = (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {sellingResult.rows.map((property) => (
                        <PropertyCard key={property.property_id} property={property} />
                    ))}
                </div>
            );
        }
        vendorSection = (
            <div className="space-y-3">
                <SectionHeading icon={House} label="Selling" />
                {sellingContent}
            </div>
        );
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-brand">My properties</h1>
            <div className="space-y-10">
                {bidderSection}
                {vendorSection}
            </div>
        </main>
    );
}