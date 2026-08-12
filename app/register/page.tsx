import RegisterForm from "@/components/register-form"; 
import pool from '@/lib/db'; 
import { hashToken } from "@/lib/invitations";

type RegisterSearchParams = {
    next?: string;
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
     let inviteToken = "";
    if (inviteToken !== "") {
        const inviteResult = await pool.query<{ email: string }>(
            `SELECT email FROM invitations
            WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
            [hashToken(inviteToken)]
        );
        invitedEmail = inviteResult.rows[0]?.email ?? "";
    }

   
    if (nextPath.startsWith("/invite/")) {
        inviteToken = nextPath.slice("/invite/".length);
    }

    return (
        <main className="mx-auto w-full max-w-6xl px-4">
            <div className="mx-auto mt-16 max-w-sm">
                <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h1 className="mb-6 text-2xl font-semibold text-brand">Create your account</h1>
                    <RegisterForm nextPath={nextPath} invitedEmail={invitedEmail} inviteToken={inviteToken} />
                </div>
            </div>
        </main>
    );
}