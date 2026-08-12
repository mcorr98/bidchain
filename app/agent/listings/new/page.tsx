import { auth } from "@/auth";
import { redirect } from "next/navigation";
import NewListingForm from "@/components/new-listing-form"; 
import InviteVendorForm from "@/components/invite-vendor-form";

export default async function NewListingPage() {
    const session = await auth();
    if (!session || session.user.role !== "agent") {
        redirect("/login");
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <div className="mx-auto max-w-2xl">
                <h1 className="mb-6 text-2xl font-semibold text-brand">New listing</h1>
                <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                    <NewListingForm />
                </div>
            </div>
            <details className="group mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-action">
                        Vendor not on BidChain yet? Invite them first
                    </summary>
                    <div className="mt-3 space-y-2">
                        <InviteVendorForm />
                    </div>
                </details>
        </main>
    );
}