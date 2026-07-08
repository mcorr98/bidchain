import pool from "../lib/db.js";
import { canonicalise, hashEvent, makeNonce, GENESIS_HASH, EventPreimage, JsonValue } from "@/lib/chain";

/**
 * Writes a LISTING_CREATED genesis event for a property in a single transaction. 
 */
async function insertGenesis(propertyId: number, actorId: number): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Locks row to prevent simultaneous queries forking the chain 
        const tail = await client.query(
            `SELECT sequence, hash
            FROM bid_events
            WHERE property_id = $1
            ORDER BY sequence DESC 
            LIMIT 1
            FOR UPDATE`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;

        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        // Pull property details so the state at listing time is recorded 
        const property = await client.query(
            `SELECT asking_price, listing_type 
        FROM properties 
        WHERE id = $1`,
            [propertyId]
        );

        if (property.rows.length === 0) {
            throw new Error(`property ${propertyId} does not exist`);
        }

        const askingPrice: number = property.rows[0].asking_price;
        const listingType: string = property.rows[0].listing_type;

        const detail: JsonValue = {
            asking_price_snapshot: askingPrice,
            listing_type_snapshot: listingType,
        };

        // Assemble preimage
        const timestamp = new Date().toISOString();
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "LISTING_CREATED",
            actor_id: actorId,
            timestamp,
            detail: canonicalise(detail),
            nonce,
            prev_hash: prevHash,
        };

        // Hash the preimage
        const hash = hashEvent(preimage);

        // Write event row
        const eventInsert = await client.query(
            `INSERT INTO bid_events (property_id, sequence, event_type, actor_id, timestamp, nonce, hash, prev_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id`,
            [propertyId, sequence, "LISTING_CREATED", actorId, timestamp, nonce, hash, prevHash]
        );

        const bidEventId: number = eventInsert.rows[0].id;

        // 6. Insert the type-specific detail table row.
        await client.query(
            `INSERT INTO listing_created_details (bid_event_id, asking_price_snapshot, listing_type_snapshot)
            VALUES ($1, $2, $3)`,
            [bidEventId, askingPrice, listingType]
        );

        await client.query("COMMIT");

        console.log("Genesis event written:");
        console.log(`bid_event_id: ${bidEventId}`);
        console.log(`property_id: ${propertyId}`);
        console.log(`sequence: ${sequence}`);
        console.log(`event_type: LISTING_CREATED`);
        console.log(`prev_hash: ${prevHash}`);
        console.log(`hash: ${hash}`);
        console.log(`nonce: ${nonce}`);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Rolled back: no event written"); 
        throw err;
    } finally {
        client.release(); 
    }
}

const propertyId = Number(process.argv[2]);
const actorId = Number(process.argv[3]);
if (!Number.isInteger(propertyId) || !Number.isInteger(actorId)) {
    console.error("Usage: npx tsx scripts/insert-genesis.ts <property_id> <actor_id>");
    process.exit(1);
}
 
insertGenesis(propertyId, actorId)
.then(() => pool.end())
.catch((err) => {
    console.error(err.message);
    pool.end();
    process.exit(1);
});