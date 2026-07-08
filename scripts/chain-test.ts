import { canonicalise, hashEvent, GENESIS_HASH, makeNonce, EventPreimage, JsonValue } from "../lib/chain.js";

let passed = 0;
let failed = 0; 

function check(label: string, condition: boolean): void {
  if (condition) {
    passed = passed + 1;
    console.log(`PASS ${label}`);
  } else {
    failed = failed + 1;
    console.log(`FAIL ${label}`);
  }
}

console.log("-canonicalise: key sorting-");
const canon = canonicalise({ b: 1, a: { d: 4, c: 3 } } as JsonValue);
check(
  "nested keys sorted",
  JSON.stringify(canon) === JSON.stringify({ a: { c: 3, d: 4 }, b: 1 })
);

console.log("\n-hashEvent: order independence-");
// Same event, checks whether detail keys in different order = same hash.
const nonce = makeNonce();
const e1: EventPreimage = {
  property_id: 1,
  sequence: 1,
  event_type: "LISTING_CREATED",
  actor_id: 7,
  timestamp: "2026-07-08T20:00:00Z",
  detail: { asking_price_snapshot: 24500000, listing_type_snapshot: "offers_over" },
  nonce,
  prev_hash: GENESIS_HASH,
}; 

const e2: EventPreimage = {
  prev_hash: GENESIS_HASH,
  nonce,
  detail: { listing_type_snapshot: "offers_over", asking_price_snapshot: 24500000 },
  timestamp: "2026-07-08T20:00:00Z",
  actor_id: 7,
  event_type: "LISTING_CREATED",
  sequence: 1,
  property_id: 1,
} as EventPreimage; 

check("reordered fields + reordered detail = identical hash", hashEvent(e1) === hashEvent(e2));

console.log("\n-hashEvent: sensitivity (tamper detection)-");
const tampered: EventPreimage = { ...e1, detail: { asking_price_snapshot: 20000000, listing_type_snapshot: "offers_over" } };
check("changing the amount changes the hash", hashEvent(e1) !== hashEvent(tampered));
check("changing nonce changes the hash", hashEvent(e1) !== hashEvent({ ...e1, nonce: makeNonce() }));
check("genesis hash is 64 zeros", GENESIS_HASH === "0000000000000000000000000000000000000000000000000000000000000000");

console.log(`\n${failed === 0 ? "ALL PASS" : "SOME FAILED"}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
