import RegisterForm from "@/components/register-form";

type RegisterSearchParams = {
    next?: string;
    email?: string;
};

type RegisterPageProps = {
    searchParams: Promise<RegisterSearchParams>;
};

export default async function RegisterPage(props: RegisterPageProps) {
    const params = await props.searchParams;

    let nextPath = "";
    if (typeof params.next === "string" && params.next.startsWith("/")) {
        nextPath = params.next;
    }

    let invitedEmail = "";
    if (typeof params.email === "string") {
        invitedEmail = params.email;
    }

    return (
        <main className="mx-auto w-full max-w-6xl px-4">
            <div className="mx-auto mt-16 max-w-sm">
                <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h1 className="mb-6 text-2xl font-semibold text-brand">Create your account</h1>
                    <RegisterForm nextPath={nextPath} invitedEmail={invitedEmail} />
                    </div>
            </div>
        </main>
    );
}