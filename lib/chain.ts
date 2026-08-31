import { createHash, randomBytes } from "crypto";

/**
 * Helper function to check hash during verification 
 * hashEvent derives bytes from data whereas this verification helper trusts only stored bytes.
 * @param text - string to be hashed 
 * @returns - hashed version of the text input 
 */
function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}


/**
 * Genesis prev_hash: 64 zeros, not nullable, per schema (prev_hash VARCHAR(64) NOT NULL).
 * The first event in every per-property chain links to this.
 */
export const GENESIS_HASH = "0".repeat(64);

/**
 * The chain event types.
 */
export type EventType =
    "LISTING_CREATED"
    | "BID_PLACED"
    | "BID_REVISED"
    | "BID_WITHDRAWN"
    | "BID_RECONFIRMED"
    | "BID_ACCEPTED"
    | "BIDDING_CLOSED"
    | "BIDDING_REOPENED"
    | "LISTING_WITHDRAWN"
    | "SALE_COLLAPSED"
    | "PROPERTY_RELISTED"
    | "SALE_COMPLETED";

export type ChainState =
    "unlisted"
    | "open"
    | "closed"
    | "sale_agreed"
    | "collapsed"
    | "completed"
    | "withdrawn";

type GrammarRule = {
    allowedIn: ChainState[];
    leadsTo: ChainState | null;
};

const EVENT_GRAMMAR: Record<EventType, GrammarRule> = {
    LISTING_CREATED: { allowedIn: ["unlisted"], leadsTo: "open" },
    BID_PLACED: { allowedIn: ["open"], leadsTo: null },
    BID_REVISED: { allowedIn: ["open"], leadsTo: null },
    BID_WITHDRAWN: { allowedIn: ["open", "closed"], leadsTo: null },
    BIDDING_CLOSED: { allowedIn: ["open"], leadsTo: "closed" },
    BIDDING_REOPENED: { allowedIn: ["closed"], leadsTo: "open" },
    BID_ACCEPTED: { allowedIn: ["closed"], leadsTo: "sale_agreed" },
    SALE_COMPLETED: { allowedIn: ["sale_agreed"], leadsTo: "completed" },
    SALE_COLLAPSED: { allowedIn: ["sale_agreed"], leadsTo: "collapsed" },
    BID_RECONFIRMED: { allowedIn: ["collapsed"], leadsTo: null },
    PROPERTY_RELISTED: { allowedIn: ["collapsed"], leadsTo: "open" },
    LISTING_WITHDRAWN: { allowedIn: ["open", "closed", "collapsed"], leadsTo: "withdrawn" },
};

export function isEventLegal(eventType: EventType, state: ChainState): boolean {
    return EVENT_GRAMMAR[eventType].allowedIn.includes(state);
}

export function nextChainState(eventType: EventType, state: ChainState): ChainState {
    if (!isEventLegal(eventType, state)) {
        return state;
    }
    const leadsTo = EVENT_GRAMMAR[eventType].leadsTo;
    if (leadsTo === null) {
        return state;
    }
    return leadsTo;
}

/**
 * Values that can survive JSON.stringify.
 * Blocks Date/undefined/functions from the preimage to prevent a broken hash (JSON.stringify silently changes or drops them which would corrupt the chain)
 */
export type JsonValue =
    string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

/**
 * Defines types of failure that can arise when chain verification fails
 */
export type Failure = {
    sequence: number,
    reason: "hash mismatch" | "broken link" | "projection mismatch" | "sequence gap" | "illegal event"
}

export type EventRow = {
    property_id: number;
    sequence: number;
    event_type: EventType;
    actor_id: number;
    timestamp: Date;
    details: JsonValue;
    canonical_details: string;
    nonce: string;
    hash: string;
    prev_hash: string;
};

/**
 * Order fields will always be hashed in so that same data = same hash
 */
export interface EventPreimage {
    property_id: number;
    sequence: number;
    event_type: EventType;
    actor_id: number;
    timestamp: string;
    details: JsonValue;
    nonce: string;
    prev_hash: string;
}

/**
 * Recursively sorts object keys so the same logical data always serialises to the
 * same string regardless of key order.
 */
export function canonicalise(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        const result: JsonValue[] = [];
        for (const element of value) {
            result.push(canonicalise(element));
        }
        return result;
    } else if (value !== null && typeof value === "object") {
        const sortedKeys = Object.keys(value).sort();
        const result: { [key: string]: JsonValue } = {};
        for (const key of sortedKeys) {
            result[key] = canonicalise(value[key]);
        }
        return result;
    } else {
        return value;
    }
}

/**
 * Builds the frozen pre-image string
 */
export function buildPreimage(event: EventPreimage, canonicalDetails: string): string {
    return [
        String(event.property_id),
        String(event.sequence),
        event.event_type,
        String(event.actor_id),
        event.timestamp,
        canonicalDetails,
        event.nonce,
        event.prev_hash,
    ].join("|");
}

/**
 * Computes the SHA-256 hash of an event's preimage.
 */
export function hashEvent(event: EventPreimage): { hash: string; canonicalDetails: string } {
    const canonicalDetails = JSON.stringify(canonicalise(event.details));
    const preimage = buildPreimage(event, canonicalDetails);
    const hash = sha256(preimage)
    return { hash, canonicalDetails };
}

/**
 * Generates a 32-character hex nonce (16 random bytes).
 * Matches the schema (nonce VARCHAR(32) NOT NULL.)
 */
export function makeNonce(): string {
    return randomBytes(16).toString("hex");
}

/**
 * Verifies the chain by rewalking it and checking the hashes and sequence against expected values. 
 * @param rows 
 * @returns 
 */
export function verifyChain(rows: EventRow[]): { valid: boolean, eventCount: number, failures: Failure[] } {

    const failures: Failure[] = [];

    let expectedPrevHash = GENESIS_HASH;
    let expectedSequence = 1;
    let state: ChainState = "unlisted";

    for (const row of rows) {
        if (row.prev_hash !== expectedPrevHash) {
            failures.push({ sequence: row.sequence, reason: "broken link" });
        }

        const preimage
            = buildPreimage(
                {
                    property_id: row.property_id,
                    sequence: row.sequence,
                    event_type: row.event_type,
                    actor_id: row.actor_id,
                    timestamp: row.timestamp.toISOString(),
                    details: row.details,
                    nonce: row.nonce,
                    prev_hash: row.prev_hash,
                },
                row.canonical_details
            );

        if (sha256(preimage) !== row.hash) {
            failures.push({ sequence: row.sequence, reason: "hash mismatch" });
        }

        if (JSON.stringify(canonicalise(row.details)) !== row.canonical_details) {
            failures.push({ sequence: row.sequence, reason: "projection mismatch" });
        }

        if (row.sequence !== expectedSequence) {
            failures.push({ sequence: row.sequence, reason: "sequence gap" })
        }

        if (!isEventLegal(row.event_type, state)) {
            failures.push({ sequence: row.sequence, reason: "illegal event" });
        }
        state = nextChainState(row.event_type, state);

        expectedPrevHash = row.hash;
        expectedSequence += 1;
    }

    return { valid: failures.length === 0, eventCount: rows.length, failures };
}