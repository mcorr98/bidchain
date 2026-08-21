import { redirect } from "next/navigation";
import { auth } from "@/auth";
import pool from "@/lib/db";
import { hasBidderProfile } from "@/lib/permissions";
import VerificationForm from "@/components/verification-form";
import SectionHeading from "@/components/section-heading";
import { FileUp, ShieldCheck } from "lucide-react";

export default async function VerificationPage() {
  const session = await auth();
  if (!session || !session.user) {
    redirect("/login");
  }
  if (!(await hasBidderProfile(Number(session.user.id)))) {
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

  let documentStatusLine;
  if (hasDocument) {
    documentStatusLine = (
      <p className="text-sm text-gray-600">
        Document last submitted on {new Date(profile.submitted_at).toLocaleDateString("en-GB")}.
        You can replace it at any time. Any previous agency verifications will remain unaffected,
        and new agencies will review your most recent document.
      </p>
    );
  } else {
    documentStatusLine = (
      <p className="text-sm text-gray-600">
        Upload photo ID to begin. Each listing agency will review your identity document before
        you can bid on one of their properties.
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-brand">Identity verification</h1>

      <div className="space-y-6">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeading icon={FileUp} label="Your document" />
          {documentStatusLine}
          <VerificationForm />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeading icon={ShieldCheck} label="Agency decisions" />
          {decisions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No decisions yet: agency review outstanding
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {decisions.map((d) => (
                <li key={d.agency_name} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{d.agency_name}</p>
                    {d.status === "rejected" && d.rejection_reason !== null && (
                      <p className="text-xs text-gray-500">{d.rejection_reason}</p>
                    )}
                  </div>
                  {d.status === "verified" ? (
                    <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-verified">
                      verified
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      rejected
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}