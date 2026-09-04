import pool from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import VerificationDecisionForm from "@/components/verification-decision-form";

type QueueRow = {
    user_id: number;
    name: string;
    email: string;
    buyer_position: string | null;
    id_document_path: string;
    id_document_hash: string;
    submitted_at: Date;
};

/**
 * Review queue for a logged in agent: contains bidders participating in this agency's
 * listings who have submitted an ID document but have no decision from this
 * agency yet. 
 * @returns - verification queue page content HTML
 */
export default async function AgentVerificationsPage() {

    const session = await auth();
    if (!session || session.user.role !== "agent") {
        redirect("/login");
    }

    const agencyId = Number(session.user.id);

    const queueResult = await pool.query<QueueRow>(
        `SELECT DISTINCT u.user_id, u.name, u.email, bp.buyer_position,
        bp.id_document_path, bp.id_document_hash, bp.submitted_at
        FROM property_participants pp
        JOIN properties p ON p.property_id = pp.property_id
        JOIN users u ON u.user_id = pp.user_id
        JOIN bidder_profiles bp ON bp.user_id = u.user_id
        WHERE p.agent_id = $1
        AND bp.id_document_path IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM bidder_verifications bv
            WHERE bv.bidder_id = u.user_id AND bv.agency_id = $1
        )
        ORDER BY bp.submitted_at ASC`,
        [agencyId]
    );
    const queue = queueResult.rows;

    return (
        <main className="mx-auto max-w-4xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-brand">Verification queue</h1>
            {queue.length === 0 && (
                <p className="text-sm text-gray-500">
                    No submissions waiting for review.
                </p>
            )}

            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {queue.map((bidder) => (
                    <li key={bidder.user_id} className="space-y-3 px-4 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-ink">{bidder.name}</p>
                                <p className="text-xs text-gray-500">{bidder.email}</p>
                            </div>
                            <p className="text-xs text-gray-400">
                                Submitted {bidder.submitted_at.toLocaleDateString("en-GB")}
                            </p>
                        </div>

                        <p className="text-xs text-gray-500">
                            <a href={`/api/documents/identity/${bidder.id_document_path}`} target="_blank" className="font-medium text-action underline">
                                View submitted document
                            </a>
                            <span className="ml-2 font-mono text-gray-400">
                                sha256: {bidder.id_document_hash.slice(0, 16)}...
                            </span>
                        </p>
                        <VerificationDecisionForm bidderId={bidder.user_id} documentHash={bidder.id_document_hash} />                    </li>
                ))}
            </ul>
        </main>
    );
}