import pg from "pg";
import { createHash } from "crypto";

// Demo tooling for the receipt-vs-rewrite experiment (Section 5.5.2).
// Tampers one event's amount, then recomputes every subsequent hash so the
// chain is internally consistent - invisible to verifyChain, caught only by
// a receipt held outside the platform.
// Usage: node --env-file=.env.local scripts/rewrite-demo.mjs <propertyId> <sequence> [newAmount]

// Re-implements the chain's canonicalisation and preimage exactly (mirrors lib/chain.ts).
function canonicalise(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalise);
    } else if (value !== null && typeof value === "object") {
        const result = {};
        for (const key of Object.keys(value).sort()) {
            result[key] = canonicalise(value[key]);
        }
        return result;
    }
    return value;
}

function sha256(text) {
    return createHash("sha256").update(text).digest("hex");
}

const propertyId = Number(process.argv[2]);
const targetSequence = Number(process.argv[3]);
const newAmount = Number(process.argv[4] ?? 99999900);

if (!propertyId || !targetSequence) {
    console.error("Usage: node --env-file=.env.local scripts/rewrite-demo.mjs <propertyId> <sequence> [newAmount]");
    process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
    await client.query("BEGIN");
    const { rows } = await client.query(
        `SELECT * FROM events WHERE property_id = $1 ORDER BY sequence ASC`,
        [propertyId]
    );
    let prevHash = null;
    for (const row of rows) {
        if (row.sequence < targetSequence) {
            prevHash = row.hash;
            continue;
        }
        if (row.sequence === targetSequence) {
            row.details = { ...row.details, amount: newAmount };
        }
        const canonicalDetails = JSON.stringify(canonicalise(row.details));
        const preimage = [
            String(row.property_id),
            String(row.sequence),
            row.event_type,
            String(row.actor_id),
            row.timestamp.toISOString(),
            canonicalDetails,
            row.nonce,
            prevHash ?? row.prev_hash,
        ].join("|");
        const hash = sha256(preimage);
        await client.query(
            `UPDATE events SET details = $1, canonical_details = $2, prev_hash = $3, hash = $4
             WHERE property_id = $5 AND sequence = $6`,
            [JSON.stringify(row.details), canonicalDetails, prevHash ?? row.prev_hash, hash, propertyId, row.sequence]
        );
        prevHash = hash;
    }
    await client.query("COMMIT");
    console.log("Rewrite complete: property", propertyId, "sequence", targetSequence, "amount now", newAmount, "- all subsequent hashes recomputed.");
} catch (err) {
    await client.query("ROLLBACK");
    throw err;
} finally {
    client.release();
    await pool.end();
}
