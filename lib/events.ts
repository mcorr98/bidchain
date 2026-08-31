import { PoolClient } from "pg";
import { EventPreimage, EventType, GENESIS_HASH, JsonValue, hashEvent, makeNonce, ChainState, isEventLegal, nextChainState } from "@/lib/chain";

type AppendEventInput = {
    client: PoolClient;
    propertyId: number;
    eventType: EventType;
    actorId: number;
    details: JsonValue;
};

type AppendedEvent = {
    sequence: number;
    hash: string;
    timestamp: string;
};

/**
 * The single place where events are appended to a property's chain. Locks + reads the tail, derives
 * the sequence and prev_hash (an empty chain makes this the genesis event),
 * builds the frozen preimage, hashes, and inserts.
 *
 * The caller must hold the property row using FOR UPDATE inside an open
 * transaction before callingto guard against forking the chain. This function
 * deliberately takes the caller's client, not the pool, so it cannot be
 * used outside a transaction by mistake.
 */
export async function appendEvent(input: AppendEventInput): Promise<AppendedEvent> {

    const history = await input.client.query<{ sequence: number; hash: string; event_type: EventType }>(
        `SELECT sequence, hash, event_type FROM events
        WHERE property_id = $1
        ORDER BY sequence ASC`,
        [input.propertyId]
    );

    let sequence: number;
    let prevHash: string;
    if (history.rows.length === 0) {
        sequence = 1;
        prevHash = GENESIS_HASH;
    } else {
        const tail = history.rows[history.rows.length - 1];
        sequence = tail.sequence + 1;
        prevHash = tail.hash;
    }

    let state: ChainState = "unlisted";
    for (const priorEvent of history.rows) {
        state = nextChainState(priorEvent.event_type, state);
    }
    if (!isEventLegal(input.eventType, state)) {
        throw new Error(
            "Illegal event for chain state: " + input.eventType + " cannot follow a chain in state '" + state + "'"
        );
    }

    const timestamp = new Date().toISOString();
    const nonce = makeNonce();
    const preimage: EventPreimage = {
        property_id: input.propertyId,
        sequence,
        event_type: input.eventType,
        actor_id: input.actorId,
        timestamp,
        details: input.details,
        nonce,
        prev_hash: prevHash,
    };
    const { hash, canonicalDetails } = hashEvent(preimage);

    await input.client.query(
        `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [input.propertyId, sequence, input.eventType, input.actorId, timestamp, input.details, canonicalDetails, nonce, hash, prevHash]
    );

    return { sequence: sequence, hash: hash, timestamp: timestamp };
}