"use server";
import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import pool from "@/lib/db";
import { redirect } from "next/navigation";
import { isActiveAgency, hasBidderProfile } from "@/lib/permissions";
import { matchesMagicBytes } from "@/lib/uploads_validation";

export type VerificationFormState = {
  status: "idle" | "error" | "success";
  message: string;
};

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Handles a bidder uploading their identity document for review.
 * The file must be a JPEG, PNG or PDF under 5MB and its magic bytes must
 * match the claimed type. The document is hashed with SHA-256, stored
 * outside public/ under a server-generated name, and the hash is saved on
 * the profile so later decisions bind to these exact bytes. A re-upload
 * replaces the previous file and clears any rejected decisions so the
 * bidder re-enters the review queue.
 * @param prevState - previous form state from useActionState
 * @param formData - the uploaded document
 * @returns - form state with an error message or success confirmation
 */
export async function submitVerification(prevState: VerificationFormState, formData: FormData): Promise<VerificationFormState> {

  const session = await auth();
  if (!session || !session.user) {
    return { status: "error", message: "You must be signed in." };
  }
  if (!(await hasBidderProfile(Number(session.user.id)))) {
    return { status: "error", message: "Only bidders submit verification." };
  }

  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Please choose a file." };
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return { status: "error", message: "File must be a JPEG, PNG, or PDF." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { status: "error", message: "File must be under 5MB." };
  }

  const previousResult = await pool.query(
    "SELECT id_document_path FROM bidder_profiles WHERE user_id = $1",
    [session.user.id]
  );
  let previousName = null;
  if (previousResult.rows.length > 0) {
    previousName = previousResult.rows[0].id_document_path;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!matchesMagicBytes(buffer, file.type)) {
    return { status: "error", message: "File contents don't match its type." };
  }

  const documentHash = createHash("sha256").update(buffer).digest("hex");
  const storedName = randomUUID() + extension;
  const uploadDir = path.join(process.cwd(), "private", "uploads", "identity");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, storedName), buffer);


  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE bidder_profiles
      SET id_document_path = $1, id_document_hash = $2,submitted_at = NOW()
      WHERE user_id = $3`,
      [storedName, documentHash, session.user.id]
    );
    await client.query(
      `DELETE FROM bidder_verifications
      WHERE bidder_id = $1 AND status = 'rejected'`,
      [session.user.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (previousName !== null && previousName !== storedName) {
    try {
      await unlink(path.join(uploadDir, previousName));
    } catch {
      // File already gone - nothing to do.
    }
  }

  revalidatePath("/verification");
  return { status: "success", message: "Document submitted for review." };
}

export type DecisionFormState = { error: string } | { success: true } | null;

/**
 * Records an agency's verification decision on a bidder.
 * The decision binds to the document hash the reviewer actually saw. If the
 * bidder replaced their document between review and approval the hashes
 * differ and the decision is refused, closing the check-then-act gap.
 * @param bidderId - the bidder being decided on
 * @param formData - decision ('verified' | 'rejected'), optional reason, and the reviewed document's hash
 * @returns - { error: string } on failed checks, { success: true } on insert
 */
export async function decideVerification(bidderId: number, _previousState: unknown, formData: FormData): Promise<DecisionFormState> {

  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "agent") {
    return { error: "Only agents can review verification submissions" };
  }

  const agencyId = Number(session.user.id);

  if (!(await isActiveAgency(agencyId))) {
    return { error: "Your agency account has not been activated yet" };
  }

  const decision = formData.get("decision");
  if (decision !== "verified" && decision !== "rejected") {
    return { error: "Choose approve or reject" };
  }

  const reasonRaw = formData.get("reason");
  let reason: string | null;
  if (typeof reasonRaw === "string" && reasonRaw !== "") {
    reason = reasonRaw;
  } else {
    reason = null;
  }

  if (decision === "rejected" && reason === null) {
    return { error: "A rejection must include a reason for the bidder" };
  }

  const participantCheck = await pool.query(
    `SELECT pp.participant_id
    FROM property_participants pp
    JOIN properties p ON p.property_id = pp.property_id
    WHERE p.agent_id = $1 AND pp.user_id = $2`,
    [agencyId, bidderId]
  );

  if (participantCheck.rowCount === 0) {
    return { error: "That bidder isn't participating in any of your listings" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const profileResult = await client.query<{ id_document_hash: string | null }>(
      `SELECT id_document_hash FROM bidder_profiles
      WHERE user_id = $1 FOR UPDATE`,
      [bidderId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].id_document_hash === null) {
      await client.query("ROLLBACK");
      return { error: "That bidder has no submitted document to review" };
    }

    const reviewedHash = formData.get("reviewed_hash");
    if (reviewedHash !== profileResult.rows[0].id_document_hash) {
      await client.query("ROLLBACK");
      return { error: "A new document was uploaded while you were reviewing this one. Refresh the page to review the new document." };
    }

    await client.query(
      `INSERT INTO bidder_verifications (bidder_id, agency_id, status, document_hash, rejection_reason)
      VALUES ($1, $2, $3, $4, $5)`,
      [bidderId, agencyId, decision, profileResult.rows[0].id_document_hash, reason]
    );

    await client.query("COMMIT");

  } catch (err) {

    console.error("decideVerification transaction failed:", err);
    await client.query("ROLLBACK");
    return { error: "Something went wrong recording the decision" };

  } finally {
    client.release();
  }

  revalidatePath("/agent/verifications");
  return { success: true };
}