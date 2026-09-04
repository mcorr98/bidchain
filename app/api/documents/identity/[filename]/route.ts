import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import pool from "@/lib/db";
import { canViewIdDocument } from "@/lib/permissions";

const CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
};

/**
 * Serves a bidder's identity document from private storage. Access is gated by canViewIdDocument.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;

    const session = await auth();
    if (!session || !session.user) {
        return new Response("Unauthorised", { status: 401 });
    }

    // The only filenames in this column are ones the server generated during uploading, 
    // so finding an exact match works as the filename validation. 
    // User input is used solely as a lookup key and never reaches the filesystem.
    const docResult = await pool.query(
        "SELECT user_id, id_document_path FROM bidder_profiles WHERE id_document_path = $1",
        [filename]
    );
    if (docResult.rowCount === 0) {
        return new Response("Not found", { status: 404 });
    }
    const ownerUserId = docResult.rows[0].user_id;
    const storedName = docResult.rows[0].id_document_path;

    const allowed = await canViewIdDocument(session.user, ownerUserId);
    if (!allowed) {
        return new Response("Forbidden", { status: 403 });
    }

    const filePath = path.join(process.cwd(), "private", "uploads", "identity", storedName);
    const buffer = await readFile(filePath);
    const extension = path.extname(storedName);
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";

    return new Response(buffer, {
        headers: {
            "Content-Type": contentType,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    });
}