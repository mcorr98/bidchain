import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

type LoginSearchParams = {
    error?: string;
    next?: string;
};

type LoginPageProps = {
    searchParams: Promise<LoginSearchParams>;
};

export default async function LoginPage(props: LoginPageProps) {
    const params = await props.searchParams;

    let redirectTarget = "/";
    if (typeof params.next === "string" && params.next.startsWith("/")) {
        redirectTarget = params.next;
    }

    const encodedNext = encodeURIComponent(redirectTarget);

    async function handleLogin(formData: FormData) {
        "use server";

        try {
            await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: redirectTarget,
            });
        } catch (error) {
            if (error instanceof AuthError) {
                redirect(`/login?error=1&next=${encodedNext}`);
            }
            throw error;
        }
    }

    let errorMessage = null;
    if (params.error) {
        errorMessage = (
            <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                That email and password didn&apos;t match. Check them and try again.
            </p>
        );
    }

    return (
        <main className="mx-auto w-full max-w-6xl px-4">
            <div className="mx-auto mt-16 max-w-sm">
                <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h1 className="mb-6 text-2xl font-semibold">Log in to BidChain</h1>

                    {errorMessage}

                    <form action={handleLogin} className="space-y-4">
                        <label className="block text-sm font-medium">
                            Email
                            <input
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                            />
                        </label>

                        <label className="block text-sm font-medium">
                            Password
                            <input
                                name="password"
                                type="password"
                                required
                                autoComplete="current-password"
                                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                            />
                        </label>

                        <button type="submit" className="w-full rounded bg-action px-4 py-2 font-medium text-white hover:bg-action-strong">
                            Log in
                        </button>
                    </form>

                    <p className="mt-6 text-sm text-gray-600">
                        No account yet?{" "}
                        <Link href={`/register?next=%{encodedNext}`} className="underline">
                            Register as a buyer
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    );
}

