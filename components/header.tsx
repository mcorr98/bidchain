import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ChevronDown } from "lucide-react";
import { hasBidderProfile, hasVendorProfile } from "@/lib/permissions";

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Header component be re-used across each page. The header conatins the logo + signout button 
 * @returns HTML to display header 
 */
export default async function Header() {
    const session = await auth();

    let showBidderNav = false;
    let showVendorNav = false;
    if (session) {
        const userId = Number(session.user.id);
        showBidderNav = await hasBidderProfile(userId);
        showVendorNav = await hasVendorProfile(userId);
    }

    let accountArea;
    if (session) {
        const displayName = session.user.name ?? "Account";
        accountArea = (
            <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-50">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                        {initialsFor(displayName)}
                    </span>
                    <span className="text-sm text-gray-700">{displayName}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-slate-200 px-4 py-2">
                        <p className="text-sm font-medium text-ink">{displayName}</p>
                        <p className="truncate text-xs text-gray-500">{session.user.email}</p>
                        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                            {session.user.role}
                        </span>
                    </div>
                    {showBidderNav && (
                        <Link href="/verification" className="block px-4 py-2 text-sm text-gray-700 hover:bg-slate-50">
                            Manage ID document
                        </Link>
                    )}
                    <form action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/" });
                    }}>
                        <button type="submit" className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-slate-50">
                            Sign out
                        </button>
                    </form>
                </div>
            </details>
        );
    } else {
        accountArea = (
            <Link href="/login" className="rounded bg-action px-3 py-1.5 text-sm font-medium text-white hover:bg-action-strong">
                Log in
            </Link>
        );
    }

    let propertiesLink = null;

    if (session?.user.role === "agent") {
        propertiesLink = <nav className="flex items-center gap-6">
            <Link href="/agent/listings" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                Dashboard
            </Link>
            <Link href="/agent/reports" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                Reports
            </Link>
            <Link href="/agent/verifications" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                Verifications
            </Link>
            {accountArea}
        </nav>;
    } else if (session) {
        propertiesLink = <nav className="flex items-center gap-6">
            {(showBidderNav || showVendorNav) && (
                <Link href="/properties" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                    My properties
                </Link>
            )}
            {accountArea}
        </nav>;
    }

    return (
        <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                    BidChain
                </Link>
                {propertiesLink}
            </div>
        </header>
    );
}