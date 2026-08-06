import { describe, it, expect } from "vitest";
import { canonicalise, hashEvent, verifyChain, makeNonce, GENESIS_HASH, EventPreimage, EventRow } from "./chain";

function buildChain(count: number): EventRow[] {
    const rows: EventRow[] = [];
    let prevHash = GENESIS_HASH;

    for (let sequence = 1; sequence <= count; sequence++) {
        const timestamp = new Date(Date.UTC(2026, 0, sequence, 12, 0, 0)).toISOString();
        const details = { amount: sequence * 100000, offer_id: sequence };
        const preimage: EventPreimage = {
            property_id: 1,
            sequence,
            event_type: "BID_PLACED",
            actor_id: 5,
            timestamp,
            details,
            nonce: "nonce" + sequence,
            prev_hash: prevHash,
        };
        const { hash, canonicalDetails } = hashEvent(preimage);

        rows.push({
            property_id: 1,
            sequence,
            event_type: "BID_PLACED",
            actor_id: 5,
            timestamp: new Date(timestamp),
            details,
            canonical_details: canonicalDetails,
            nonce: "nonce" + sequence,
            hash,
            prev_hash: prevHash,
        });

        prevHash = hash;
    }

    return rows;
}

describe("canonicalise", () => {
    it("sorts object keys", () => {
        const result = canonicalise({ b: 1, a: 2 });
        expect(JSON.stringify(result)).toBe('{"a":2,"b":1}');
    });

    it("produces the same output even with a different input key order", () => {
        const one = JSON.stringify(canonicalise({ amount: 100, offer_id: 3, conditions: null }));
        const two = JSON.stringify(canonicalise({ conditions: null, offer_id: 3, amount: 100 }));
        expect(one).toBe(two);
    });

    it("sorts keys within nested objects", () => {
        const result = canonicalise({ outer: { z: 1, a: 2 } });
        expect(JSON.stringify(result)).toBe('{"outer":{"a":2,"z":1}}');
    });

    it("keeps array order the same", () => {
        const result = canonicalise([3, 1, 2]);
        expect(JSON.stringify(result)).toBe("[3,1,2]");
    });

    it("passes primitive types through unchanged", () => {
        expect(canonicalise("text")).toBe("text");
        expect(canonicalise(42)).toBe(42);
        expect(canonicalise(null)).toBe(null);
    });
});

describe("hashEvent", () => {
    const preimage: EventPreimage = {
        property_id: 1,
        sequence: 1,
        event_type: "BID_PLACED",
        actor_id: 5,
        timestamp: "2026-01-01T12:00:00.000Z",
        details: { amount: 24500000, offer_id: 1 },
        nonce: "abc123",
        prev_hash: GENESIS_HASH,
    };

    it("produces same hash from identical input", () => {
        expect(hashEvent(preimage).hash).toBe(hashEvent(preimage).hash);
    });

    it("returns a 64-character hash", () => {
        const hash = hashEvent(preimage).hash;
        const hexCharacters = "0123456789abcdef";

        expect(hash.length).toBe(64);

        for (const character of hash) {
            expect(hexCharacters.includes(character)).toBe(true);
        }
    });

    it("returns the canonical detail string that was hashed", () => {
        const { canonicalDetails } = hashEvent(preimage);
        expect(canonicalDetails).toBe('{"amount":24500000,"offer_id":1}');
    });

    it("produces the same hash when detail keys are given in a different order", () => {
        const reordered: EventPreimage = {
            ...preimage,
            details: { offer_id: 1, amount: 24500000 },
        };
        expect(hashEvent(reordered).hash).toBe(hashEvent(preimage).hash);
    });

    it("changes the hash when the amount changes", () => {
        const tampered: EventPreimage = {
            ...preimage,
            details: { amount: 20000000, offer_id: 1 },
        };
        expect(hashEvent(tampered).hash).not.toBe(hashEvent(preimage).hash);
    });

    it("changes the hash when prev_hash changes", () => {
        const relinked: EventPreimage = { ...preimage, prev_hash: "f".repeat(64) };
        expect(hashEvent(relinked).hash).not.toBe(hashEvent(preimage).hash);
    });

    it("changes the hash when the nonce changes", () => {
        const renonced: EventPreimage = { ...preimage, nonce: "different" };
        expect(hashEvent(renonced).hash).not.toBe(hashEvent(preimage).hash);
    });
});

describe("makeNonce", () => {
    it("returns 32 hex characters", () => {
        expect(makeNonce().length).toBe(32);

    });

    it("returns a different value each call", () => {
        expect(makeNonce()).not.toBe(makeNonce());
    });
});

describe("verifyChain", () => {
    it("accepts a clean chain", () => {
        const result = verifyChain(buildChain(4));
        expect(result.valid).toBe(true);
        expect(result.eventCount).toBe(4);
        expect(result.failures).toHaveLength(0);
    });

    it("accepts an empty chain", () => {
        const result = verifyChain([]);
        expect(result.valid).toBe(true);
        expect(result.eventCount).toBe(0);
    });

    it("detects a tampered canonical payload as a hash mismatch", () => {
        const chain = buildChain(3);
        chain[1].canonical_details = '{"amount":1,"offer_id":2}';

        const result = verifyChain(chain);
        expect(result.valid).toBe(false);
        expect(result.failures).toContainEqual({ sequence: 2, reason: "hash mismatch" });
    });

    it("detects a broken link when prev_hash does not match the previous event", () => {
        const chain = buildChain(3);
        chain[2].prev_hash = "f".repeat(64);

        const result = verifyChain(chain);
        expect(result.valid).toBe(false);
        expect(result.failures).toContainEqual({ sequence: 3, reason: "broken link" });
    });

    it("detects when the stored JSON has been edited but the hashed bytes haven't", () => {
        const chain = buildChain(2);
        chain[0].details = { amount: 999, offer_id: 1 };

        const result = verifyChain(chain);
        expect(result.valid).toBe(false);
        expect(result.failures).toContainEqual({ sequence: 1, reason: "projection mismatch" });
    });

    it("detects a missing event as a sequence gap", () => {
        const chain = buildChain(3);
        chain.splice(1, 1);

        const result = verifyChain(chain);
        expect(result.valid).toBe(false);
        expect(result.failures.some((f) => f.reason === "sequence gap")).toBe(true);
    });

    it("does not detect a tamper-and-repair: a consistently rewritten chain verifies", () => {
        const chain = buildChain(3);

        let prevHash = GENESIS_HASH;
        for (const row of chain) {
            if (row.sequence === 2) {
                row.details = { amount: 1, offer_id: 2 };
            }
            const preimage: EventPreimage = {
                property_id: row.property_id,
                sequence: row.sequence,
                event_type: row.event_type,
                actor_id: row.actor_id,
                timestamp: row.timestamp.toISOString(),
                details: row.details,
                nonce: row.nonce,
                prev_hash: prevHash,
            };
            const { hash, canonicalDetails } = hashEvent(preimage);
            row.prev_hash = prevHash;
            row.canonical_details = canonicalDetails;
            row.hash = hash;
            prevHash = hash;
        }

        expect(verifyChain(chain).valid).toBe(true);
    });
});