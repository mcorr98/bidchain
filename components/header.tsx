import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function Header() {
    const session = await auth();

    let accountArea;
    if (session) {
        accountArea = (
            <div className="flex items-centre gap-4">
                <span className="text-sm text-gray-700">
                    {session.user.name}
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">
                        {session.user.role}
                    </span>
                </span>
                <form
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

    return (
        <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                    BidChain
                </Link>

                <nav className="flex items-centre gap-6">
                    <Link href="/properties" className="px-1 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                        Browse properties
                    </Link>
                    {accountArea}
                </nav>
            </div>
        </header>
    );
}