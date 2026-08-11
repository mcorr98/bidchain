import { redirect } from "next/navigation";
import { auth } from "@/auth";
import pool from "@/lib/db";
import VerificationForm from "@/components/verification-form";

export default async function VerificationPage() {
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }
  if (session.user.role !== "bidder") {
    redirect("/");
  }

  const profileResult = await pool.query(
    `SELECT id_document_path, submitted_at
    FROM bidder_profiles
    WHERE user_id = $1`,
    [session.user.id]
  );
  const profile = profileResult.rows[0];
  const hasDocument = profile.id_document_path !== null;

  const decisionsResult = await pool.query(
    `SELECT bv.status, bv.rejection_reason, bv.decided_at, ap.agency_name
    FROM bidder_verifications bv
    JOIN agent_profiles ap ON ap.user_id = bv.agency_id
    WHERE bv.bidder_id = $1
    ORDER BY bv.decided_at DESC`,
    [session.user.id]
  );
  const decisions = decisionsResult.rows;

  return (
    <main>
      <h1>Identity verification</h1>

      {!hasDocument && (
        <p>
          Upload photo ID to begin. Each listing agency reviews your document before you can bid on their properties.
        </p>
      )}

      {hasDocument && (
        <p>
          Document submitted{" "}{new Date(profile.submitted_at).toLocaleDateString("en-GB")}.
          Agencies review it after you accept an invitation to bid on one of their listings.
        </p>
      )}

      {decisions.length > 0 && (
        <section>
          <h2>Agency decisions</h2>
          <ul>
            {decisions.map((d) => (
              <li key={d.agency_name}>
                {d.agency_name}: {d.status}
                {d.status === "rejected" && d.rejection_reason !== null && (
                  <> - {d.rejection_reason}</>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasDocument && (
        <p className="text-sm">
          You can replace your document at any time (for example if your ID has
          been renewed). Existing agency verifications will not be impacted, and new
          agencies will review the latest document.
        </p>
      )}

      <VerificationForm />
    </main>
  );
}