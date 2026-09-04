import { auth } from "@/auth";
import { redirect } from "next/navigation";
import NewListingForm from "@/components/new-listing-form";

/**
 * New listing page where an agent starts a draft.
 */
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
        </main>
    );
}