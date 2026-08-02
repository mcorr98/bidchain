import { auth } from "@/auth";
import pool from "@/lib/db";
import { hashToken } from "@/lib/invitations";
import Link from "next/link";
import AcceptInvitationButton from "@/components/accept-invitation-button";

type InviteRouteParams = {
    token: string;
};

type InvitePageProps = {
    params: Promise<InviteRouteParams>;
};

type InvitationRow = {
    invitation_id: number;
    email: string;
    purpose: "bidder_invite" | "vendor_activation";
    property_id: number | null;
    expires_at: Date;
    accepted_at: Date | null;
    address_line_1: string | null;
    city: string | null;
};

export default async function InvitePage(props: InvitePageProps) {
    const params = await props.params;
    const tokenHash = hashToken(params.token);

    const result = await pool.query<InvitationRow>(
        `SELECT i.invitation_id, i.email, i.purpose, i.property_id, i.expires_at, i.accepted_at, p.address_line_1, p.city
        FROM invitations i
        LEFT JOIN properties p ON p.property_id = i.property_id
        WHERE i.token_hash = $1`,
        [tokenHash]
    );

    const invitation = result.rows[0];

    let problem = null;
    if (invitation === undefined) {
        problem = "This invitation link isn't valid.";
    } else if (invitation.accepted_at !== null) {
        problem = "This invitation has already been used.";
    } else if (invitation.expires_at < new Date()) {
        problem = "This invitation has expired. Ask the agent to send a new one.";
    }

    if (problem !== null) {
        return (
            <main className="mx-auto max-w-6xl px-4 py-8">
                <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h1 className="mb-2 text-xl font-semibold text-brand">Invitation unavailable</h1>
                    <p className="text-sm text-gray-600">{problem}</p>
                </div>
            </main>
        );
    }

    // Session branch
    const session = await auth(); 

    let body;
    if (session === null) {
        body = (
            <div className="space-y-3">
                <p className="text-sm text-gray-600">
                    Sign in as <span className="font-medium">{invitation.email}</span> to accept, or create an account with that address.
                </p>
                <Link href={`/login?next=/invite/${params.token}`} className="block rounded bg-action px-4 py-2 text-center font-medium text-white hover:bg-action-strong">
                    Sign in
                </Link>
                <Link href={`/register?next=/invite/${params.token}&email=${encodeURIComponent(invitation.email)}`} className="block rounded border border-slate-300 px-4 py-2 text-center text-sm hover:bg-slate-50">
                    Create an account
                </Link>
            </div>
        );
    } else if (session.user.email !== invitation.email) {
        body = (
            <p className="text-sm text-gray-600">
               This invitation was sent to a different email address. Sign out and sign in with the invited account.
            </p>
        );
    } else {
        body = <AcceptInvitationButton token={params.token} />;
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                <h1 className="mb-2 text-xl font-semibold text-brand">You&apos;ve been invited to bid</h1>
                <p className="mb-6 text-sm text-gray-600">
                    {invitation.address_line_1}, {invitation.city}
                </p>
                {body}
            </div>
        </main>
    );
}
