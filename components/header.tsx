import Link from "next/link";
import { auth, signOut } from "@/auth";

/**
 * Header component be re-used across each page. The header conatins the logo + signout button 
 * @returns HTML to display header 
 */
export default async function Header() {
    const session = await auth();

    let accountArea;
    if (session) {
        accountArea = (
            <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 text-sm text-gray-700">
                    {session.user.name}
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">
                        {session.user.role}
                    </span>
                </span>
                <form className="flex"
                    action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/ " });
                    }}
                >
                    <button
                        type="submit"
                        className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
                    >
                        Sign out
                    </button>
                </form>
            </div>
        );
    } else {
        accountArea = (
            <Link
                href="/login"
                className="rounded bg-action px-3 py-1.5 text-sm font-medium text-white hover:bg-action-strong"
            >
                Log in
            </Link>
        );
    }

    let propertiesLink = null;

    if (session?.user.role === "agent") {
        propertiesLink = <nav className="flex items-center gap-6">
            <Link href="/agent/listings" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                Manage listings
            </Link>
            {accountArea}
        </nav>;
    } else if (session?.user.role === "bidder") {
        propertiesLink = <nav className="flex items-center gap-6">
            <Link href="/properties" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                My bids
            </Link>
            {accountArea}
        </nav>
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