import pool from "../lib/db.ts";
import { hashEvent } from "../lib/chain.ts";

async function run() {
    const result = await pool.query(
        `SELECT property_id, sequence, event_type, actor_id, timestamp, details, nonce, hash, prev_hash
         FROM events`
    );
    
    result.rows.forEach(row => {
        const { hash } = hashEvent({
        property_id: row.property_id,
        sequence: row.sequence,
        event_type: row.event_type,
        actor_id: row.actor_id,
        timestamp: row.timestamp.toISOString(),
        details: row.details,
        nonce: row.nonce,
        prev_hash: row.prev_hash,
    });

    console.log("stored:  ", row.hash);
    console.log("computed:", hash);
    console.log(hash === row.hash ? "✅ MATCH - module speaks the seed's dialect" : "❌ MISMATCH");
    });

    await pool.end();
}
run();