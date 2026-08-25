import pool from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { canManageProperty } from "@/lib/permissions";
import { BiddingState } from "@/lib/types";
import DraftEditForm from "@/components/draft-edit-form";
import ReplaceVendorForm from "@/components/replace-vendor-form";
import PublishListingButton from "@/components/publish-listing-button";

type DraftRouteParams = {
    id: string;
};

type DraftPageProps = {
    params: Promise<DraftRouteParams>;
};

type DraftPropertyRow = {
    property_id: number;
    vendor_id: number | null;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    postcode: string;
    asking_price: number;
    listing_type: string;
    bedrooms: number | null;
    bathrooms: number | null;
    receptions: number | null;
    listing_url: string | null;
    image_path: string | null;
    state: BiddingState;
};

type VendorRow = {
    name: string;
    email: string;
};

type PendingInviteRow = {
    email: string;
    expires_at: Date;
};

export default async function DraftPage(props: DraftPageProps) {
    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    if (session.user.role !== "agent") {
        redirect("/");
    }
    const agentId = Number(session.user.id);

    const params = await props.params;
    const propertyId = Number(params.id);
    if (Number.isNaN(propertyId)) {
        notFound();
    }
    if (!(await canManageProperty(propertyId, agentId))) {
        notFound();
    }

    const propertyResult = await pool.query<DraftPropertyRow>(
        `SELECT property_id, vendor_id, address_line_1, address_line_2, city, postcode,
        asking_price, listing_type, bedrooms, bathrooms, receptions, listing_url,
        image_path, state
        FROM properties WHERE property_id = $1`,
        [propertyId]
    );
    const property = propertyResult.rows[0];
    if (!property) {
        notFound();
    }
    if (property.state !== "draft") {
        redirect(`/properties/${propertyId}`);
    }

    // Vendor panel info
    let vendor: VendorRow | null = null;
    if (property.vendor_id !== null) {
        const vendorResult = await pool.query<VendorRow>(
            `SELECT name, email FROM users WHERE user_id = $1`,
            [property.vendor_id]
        );
        vendor = vendorResult.rows[0] ?? null;
    }

    let pendingInvite: PendingInviteRow | null = null;
    if (vendor === null) {
        const inviteResult = await pool.query<PendingInviteRow>(
            `SELECT email, expires_at FROM invitations
            WHERE property_id = $1 AND purpose = 'vendor_activation' AND accepted_at IS NULL`,
            [propertyId]
        );
        pendingInvite = inviteResult.rows[0] ?? null;
    }

    let vendorStatusLine;
    if (vendor !== null) {
        vendorStatusLine = (
            <p className="text-sm text-green-800">
                Joined: {vendor.name} ({vendor.email})
            </p>
        );
    } else if (pendingInvite !== null) {
        vendorStatusLine = (
            <p className="text-sm text-amber-800">
                Invited: {pendingInvite.email} (expires {pendingInvite.expires_at.toLocaleDateString("en-GB")})
            </p>
        );
    } else {
        vendorStatusLine = (
            <p className="text-sm text-gray-600">No vendor invited yet</p>
        );
    }

    let publishArea;
    if (property.vendor_id !== null) {
        publishArea = <PublishListingButton propertyId={propertyId} />;
    } else {
        publishArea = (
            <p className="text-sm text-gray-600">
                Can not publish without a joined vendor.
            </p>
        );
    }

    return (
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold text-ink">Draft: {property.address_line_1}, {property.city}</h1>
                <p className="text-sm text-gray-500">Edits to the listing are possible until the moment of publication.</p>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="mb-4 text-lg font-medium">Listing details</h2>
                <DraftEditForm
                    propertyId={propertyId}
                    defaults={{
                        address_line_1: property.address_line_1,
                        address_line_2: property.address_line_2 ?? "",
                        city: property.city,
                        postcode: property.postcode,
                        asking_price_pounds: property.asking_price / 100,
                        listing_type: property.listing_type,
                        bedrooms: property.bedrooms,
                        bathrooms: property.bathrooms,
                        receptions: property.receptions,
                        listing_url: property.listing_url ?? "",
                    }}
                    imagePath={property.image_path}
                />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="mb-2 text-lg font-medium">Vendor</h2>
                {vendorStatusLine}
                <div className="mt-4">
                    <ReplaceVendorForm
                        propertyId={propertyId}
                        currentEmail={pendingInvite?.email ?? null}
                        vendorJoined={vendor !== null}
                    />
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="mb-2 text-lg font-medium">Publish</h2>
                {publishArea}
            </section>
        </main>
    );
}