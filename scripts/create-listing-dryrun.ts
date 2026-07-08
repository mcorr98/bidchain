import { canonicalise, hashEvent, makeNonce, GENESIS_HASH, EventPreimage, JsonValue } from "../lib/chain.js";

// Simulate exactly what insert-genesis.ts computes without the DB round-trip,
// to see the real preimage and hash for LISTING_CREATED. 

const propertyId = 1;
const actorId = 3;               
const askingPrice = 24500000;    
const listingType = "offers_over";

const detail: JsonValue = {
  asking_price_snapshot: askingPrice,
  listing_type_snapshot: listingType,
};

const timestamp = "2026-07-08T20:15:00.000Z"; // fixed for demo
const nonce = "fixednoncefixednoncefixednonce00"; // fixed 32-char for demo

const preimage: EventPreimage = {
  property_id: propertyId,
  sequence: 1,
  event_type: "LISTING_CREATED",
  actor_id: actorId,
  timestamp,
  detail: canonicalise(detail),
  nonce,
  prev_hash: GENESIS_HASH,
};

console.log("Canonical preimage string that gets hashed:");
console.log("  " + JSON.stringify(canonicalise(preimage as unknown as JsonValue)));
console.log("");
console.log("Genesis event that would be written:");
console.log("  property_id : " + preimage.property_id);
console.log("  sequence    : " + preimage.sequence + "   (genesis)");
console.log("  event_type  : " + preimage.event_type);
console.log("  actor_id    : " + preimage.actor_id);
console.log("  prev_hash   : " + preimage.prev_hash);
console.log("  hash        : " + hashEvent(preimage));

// Evidences that a recompute produces identical hash
console.log("");
console.log("Recompute identical? " + (hashEvent(preimage) === hashEvent(preimage)));