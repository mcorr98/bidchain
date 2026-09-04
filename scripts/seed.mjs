// ============================================================================
// BidChain - seed script (scripts/seed.mjs)
// ============================================================================
// This file was AI generated 
// Seeds a full-market demo:
//   * 2 active agencies
//   * 4 vendors (one dual-role: also a bidder) + 1 outstanding vendor invite
//   * 8 bidders across every verification state + 1 outstanding bidder invite
//   * 12 properties covering every lifecycle stage, with rich bid ladders:
//   * placements, revisions, a bid withdrawal, structured conditions,
//   * position/funding snapshots on every bid
//   * every chain verified from canonical_details before the script exits
//
// Listing addresses, prices, specs and listing_urls are real PropertyPal
// listings (public facts; links go stale as properties sell). Photos reuse
// local demo images - listing photography is copyrighted and not scraped.
//
// Run: npm run seed
// ============================================================================

import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import bcrypt from "bcrypt";
import pg from "pg";

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set - run with: npm run seed");
    process.exit(1);
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

const DEMO_PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Chain helpers - mirror of lib/chain.ts
// ---------------------------------------------------------------------------

const GENESIS_HASH = "0".repeat(64);

function canonicalise(obj) {
    if (Array.isArray(obj)) {
        return obj.map((element) => canonicalise(element));
    } else if (obj !== null && typeof obj === "object") {
        const sortedKeys = Object.keys(obj).sort();
        const result = {};
        for (const key of sortedKeys) {
            result[key] = canonicalise(obj[key]);
        }
        return result;
    } else {
        return obj;
    }
}

function buildPreimage(event, canonicalDetails) {
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

function sha256(text) {
    return createHash("sha256").update(text).digest("hex");
}

async function appendEvent(client, { property_id, event_type, actor_id, details, timestamp }) {
    const tail = await client.query(
        "SELECT sequence, hash FROM events WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1",
        [property_id]
    );

    let sequence;
    let prev_hash;
    if (tail.rows.length === 0) {
        sequence = 1;
        prev_hash = GENESIS_HASH;
    } else {
        sequence = tail.rows[0].sequence + 1;
        prev_hash = tail.rows[0].hash;
    }

    const nonce = randomBytes(16).toString("hex");
    const canonicalDetails = JSON.stringify(canonicalise(details));
    const preimage = buildPreimage(
        { property_id, sequence, event_type, actor_id, timestamp, nonce, prev_hash },
        canonicalDetails
    );
    const hash = sha256(preimage);

    await client.query(
        `INSERT INTO events
           (property_id, sequence, event_type, actor_id, timestamp,
            details, canonical_details, nonce, hash, prev_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [property_id, sequence, event_type, actor_id, timestamp,
            details, canonicalDetails, nonce, hash, prev_hash]
    );
}

async function verifyChain(client, property_id) {
    const result = await client.query(
        `SELECT sequence, event_type, actor_id, timestamp,
                details, canonical_details, nonce, hash, prev_hash
           FROM events WHERE property_id = $1 ORDER BY sequence ASC`,
        [property_id]
    );

    const failures = [];
    let expectedPrev = GENESIS_HASH;

    for (const row of result.rows) {
        if (row.prev_hash !== expectedPrev) {
            failures.push({ sequence: row.sequence, reason: "broken link" });
        }

        const preimage = buildPreimage(
            {
                property_id: property_id,
                sequence: row.sequence,
                event_type: row.event_type,
                actor_id: row.actor_id,
                timestamp: row.timestamp.toISOString(),
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

        expectedPrev = row.hash;
    }

    return { valid: failures.length === 0, count: result.rows.length, failures };
}

// ---------------------------------------------------------------------------
// Bid terms - mirror of placeBid's structured vocabulary
// ---------------------------------------------------------------------------

const FLAG_LABELS = {
    subject_to_survey: "Subject to survey",
    flexible_completion: "Flexible on completion date",
};

function buildConditionsSummary(flags, note) {
    const parts = flags.map((flag) => FLAG_LABELS[flag]);
    if (note !== null) {
        parts.push(note);
    }
    if (parts.length === 0) {
        return null;
    }
    return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Lifecycle recipe helpers - each mirrors the corresponding server action's
// writes, so seeded data is shaped exactly as live data would be.
// ---------------------------------------------------------------------------

function daysAgo(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function inviteExpiry() {
    return new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();
}

function makeTokenHash() {
    return sha256(randomBytes(32).toString("hex"));
}

async function publishProperty(client, spec, agentId, vendorId) {
    const listedAt = daysAgo(spec.listedDaysAgo);
    const propResult = await client.query(
        `INSERT INTO properties
           (vendor_id, agent_id, address_line_1, address_line_2, city, postcode, asking_price,
            bedrooms, bathrooms, receptions, image_path, listing_url,
            listing_type, status, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', 'open', $14, $14)
         RETURNING property_id`,
        [vendorId, agentId, spec.address_line_1, spec.address_line_2 ?? null, spec.city, spec.postcode,
            spec.asking_price, spec.bedrooms, spec.bathrooms, spec.receptions,
            spec.image, spec.listing_url, spec.listing_type, listedAt]
    );
    const propertyId = propResult.rows[0].property_id;

    await appendEvent(client, {
        property_id: propertyId,
        event_type: "LISTING_CREATED",
        actor_id: agentId,
        timestamp: listedAt,
        details: {
            asking_price_snapshot: spec.asking_price,
            listing_type_snapshot: spec.listing_type,
        },
    });

    return propertyId;
}

async function createDraft(client, spec, agentId, vendorId) {
    const createdAt = daysAgo(spec.listedDaysAgo);
    const propResult = await client.query(
        `INSERT INTO properties
           (vendor_id, agent_id, address_line_1, address_line_2, city, postcode, asking_price,
            bedrooms, bathrooms, receptions, image_path, listing_url,
            listing_type, status, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', 'draft', $14, $14)
         RETURNING property_id`,
        [vendorId, agentId, spec.address_line_1, spec.address_line_2 ?? null, spec.city, spec.postcode,
            spec.asking_price, spec.bedrooms, spec.bathrooms, spec.receptions,
            spec.image, spec.listing_url, spec.listing_type, createdAt]
    );
    return propResult.rows[0].property_id;
}

async function joinParticipant(client, propertyId, userId, agentId, joinedAtDaysAgo) {
    await client.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by, joined_at)
         VALUES ($1, $2, 'joined', $3, $4)`,
        [propertyId, userId, agentId, daysAgo(joinedAtDaysAgo)]
    );
}

// terms: { position, funding, flags, note }
async function placeBid(client, propertyId, bidderId, amount, terms, placedDaysAgo) {
    const placedAt = daysAgo(placedDaysAgo);
    const conditions = buildConditionsSummary(terms.flags, terms.note);

    const offerResult = await client.query(
        `INSERT INTO offers (property_id, bidder_id, current_amount, conditions, buyer_position, funding, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7) RETURNING offer_id`,
        [propertyId, bidderId, amount, conditions, terms.position, terms.funding, placedAt]
    );
    const offerId = offerResult.rows[0].offer_id;

    await appendEvent(client, {
        property_id: propertyId,
        event_type: "BID_PLACED",
        actor_id: bidderId,
        timestamp: placedAt,
        details: {
            offer_id: offerId,
            amount: amount,
            conditions: conditions,
            condition_flags: terms.flags,
            note: terms.note,
            buyer_position: terms.position,
            funding: terms.funding,
        },
    });

    return offerId;
}

async function reviseBid(client, propertyId, bidderId, offerId, oldAmount, newAmount, terms, revisedDaysAgo) {
    const revisedAt = daysAgo(revisedDaysAgo);
    const conditions = buildConditionsSummary(terms.flags, terms.note);

    await client.query(
        `UPDATE offers SET current_amount = $1, conditions = $2, buyer_position = $3, funding = $4, updated_at = $5
         WHERE offer_id = $6`,
        [newAmount, conditions, terms.position, terms.funding, revisedAt, offerId]
    );

    await appendEvent(client, {
        property_id: propertyId,
        event_type: "BID_REVISED",
        actor_id: bidderId,
        timestamp: revisedAt,
        details: {
            offer_id: offerId,
            old_amount: oldAmount,
            new_amount: newAmount,
            conditions: conditions,
            condition_flags: terms.flags,
            note: terms.note,
            buyer_position: terms.position,
            funding: terms.funding,
        },
    });
}

async function withdrawBid(client, propertyId, bidderId, offerId, amount, withdrawnDaysAgo) {
    const withdrawnAt = daysAgo(withdrawnDaysAgo);
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "BID_WITHDRAWN",
        actor_id: bidderId,
        timestamp: withdrawnAt,
        details: { offer_id: offerId, amount: amount },
    });
    await client.query(
        `UPDATE offers SET status = 'withdrawn', updated_at = $1 WHERE offer_id = $2`,
        [withdrawnAt, offerId]
    );
}

async function closeBidding(client, propertyId, agentId, closedDaysAgo) {
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "BIDDING_CLOSED",
        actor_id: agentId,
        timestamp: daysAgo(closedDaysAgo),
        details: {},
    });
    await client.query(`UPDATE properties SET state = 'closed' WHERE property_id = $1`, [propertyId]);
}

async function acceptOffer(client, propertyId, vendorId, offerId, amount, acceptedDaysAgo) {
    const acceptedAt = daysAgo(acceptedDaysAgo);
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "BID_ACCEPTED",
        actor_id: vendorId,
        timestamp: acceptedAt,
        details: { offer_id: offerId, amount: amount },
    });
    await client.query(
        `UPDATE offers SET status = 'accepted', updated_at = $1 WHERE offer_id = $2`,
        [acceptedAt, offerId]
    );
    await client.query(
        `UPDATE offers SET status = 'expired', updated_at = $1
         WHERE property_id = $2 AND status = 'active' AND offer_id != $3`,
        [acceptedAt, propertyId, offerId]
    );
    await client.query(
        `UPDATE properties SET state = 'sale_agreed', updated_at = $1 WHERE property_id = $2`,
        [acceptedAt, propertyId]
    );
}

async function collapseSale(client, propertyId, actorId, offerId, amount, initiatedBy, reason, collapsedDaysAgo) {
    const collapsedAt = daysAgo(collapsedDaysAgo);
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "SALE_COLLAPSED",
        actor_id: actorId,
        timestamp: collapsedAt,
        details: { failed_offer_id: offerId, amount: amount, initiated_by: initiatedBy, reason: reason, note: null },
    });
    await client.query(
        `UPDATE offers SET status = 'collapsed', updated_at = $1 WHERE offer_id = $2`,
        [collapsedAt, offerId]
    );
    await client.query(
        `UPDATE properties SET state = 'collapsed', updated_at = $1 WHERE property_id = $2`,
        [collapsedAt, propertyId]
    );
}

async function relistProperty(client, propertyId, agentId, previousPrice, newPrice, relistedDaysAgo) {
    const relistedAt = daysAgo(relistedDaysAgo);
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "PROPERTY_RELISTED",
        actor_id: agentId,
        timestamp: relistedAt,
        details: { previous_asking_price: previousPrice, new_asking_price: newPrice },
    });
    await client.query(
        `UPDATE properties SET asking_price = $1, state = 'open', updated_at = $2 WHERE property_id = $3`,
        [newPrice, relistedAt, propertyId]
    );
    await client.query(
        `UPDATE property_participants SET status = 'lapsed'
         WHERE property_id = $1 AND status = 'joined'`,
        [propertyId]
    );
}

async function completeSale(client, propertyId, agentId, completedDaysAgo) {
    const completedAt = daysAgo(completedDaysAgo);
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "SALE_COMPLETED",
        actor_id: agentId,
        timestamp: completedAt,
        details: {},
    });
    await client.query(
        `UPDATE properties SET state = 'completed', status = 'sold', updated_at = $1 WHERE property_id = $2`,
        [completedAt, propertyId]
    );
}

async function withdrawListing(client, propertyId, agentId, reason, withdrawnDaysAgo) {
    const withdrawnAt = daysAgo(withdrawnDaysAgo);
    await appendEvent(client, {
        property_id: propertyId,
        event_type: "LISTING_WITHDRAWN",
        actor_id: agentId,
        timestamp: withdrawnAt,
        details: { reason: reason },
    });
    await client.query(
        `UPDATE offers SET status = 'expired', updated_at = $1
         WHERE property_id = $2 AND status = 'active'`,
        [withdrawnAt, propertyId]
    );
    await client.query(
        `UPDATE properties SET state = 'withdrawn', status = 'withdrawn', updated_at = $1 WHERE property_id = $2`,
        [withdrawnAt, propertyId]
    );
}

// ---------------------------------------------------------------------------
// Ryan's seeded ID document (real 1x1 PNG; hash matches bytes on disk)
// ---------------------------------------------------------------------------

const SEED_DOC_NAME = "00000000-0000-4000-8000-000000000001.png";
const SEED_DOC_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

// ---------------------------------------------------------------------------
// Property data - real Belfast PropertyPal listings (August 2026); photos
// cycle the local demo set. All prices integer PENCE.
// ---------------------------------------------------------------------------

const IMAGES = [
    "/uploads/cyprus-avenue.jpg",
    "/uploads/marlborough-park.jpg",
    "/uploads/seacliff-road.jpg",
    "/uploads/chestnut-grove.jpg",
    "/uploads/my-ladys-mile.jpg",
    "/uploads/clarendon-street.jpg",
];

function img(i) {
    return IMAGES[i % IMAGES.length];
}

const P = {
    cyprus: {
        address_line_1: "14 Cyprus Avenue", city: "Belfast", postcode: "BT5 5NT",
        asking_price: 24500000, bedrooms: 4, bathrooms: 2, receptions: 2,
        listing_type: "offers_over", listedDaysAgo: 16, image: img(0), listing_url: null,
    },
    pasadena: {
        address_line_1: "26 Pasadena Gardens", city: "Belfast", postcode: "BT5 6HU",
        asking_price: 32500000, bedrooms: 3, bathrooms: 2, receptions: 2,
        listing_type: "offers_around", listedDaysAgo: 9, image: img(1),
        listing_url: "https://www.propertypal.com/26-pasadena-gardens-belfast/1081885",
    },
    sandhill: {
        address_line_1: "28 Sandhill Gardens", city: "Belfast", postcode: "BT5 6FF",
        asking_price: 43500000, bedrooms: 3, bathrooms: 2, receptions: 2,
        listing_type: "offers_over", listedDaysAgo: 21, image: img(2),
        listing_url: "https://www.propertypal.com/28-sandhill-gardens-belfast/1092957",
    },
    baronscourt: {
        address_line_1: "20 Baronscourt Heights", address_line_2: "Saintfield Road", city: "Carryduff", postcode: "BT8 8RS",
        asking_price: 49500000, bedrooms: 6, bathrooms: 3, receptions: 3,
        listing_type: "offers_around", listedDaysAgo: 30, image: img(3),
        listing_url: "https://www.propertypal.com/20-baronscourt-heights-saintfield-road-carryduff-belfast/1081251",
    },
    blackquarter: {
        address_line_1: "135 Black Quarter Meadow", city: "Carryduff", postcode: "BT8 8GF",
        asking_price: 40000000, bedrooms: 4, bathrooms: 3, receptions: 3,
        listing_type: "offers_around", listedDaysAgo: 55, image: img(4),
        listing_url: "https://www.propertypal.com/135-black-quarter-meadow-carryduff-belfast/1071333",
    },
    knockbracken: {
        address_line_1: "4 Knockbracken Gardens", city: "Carryduff", postcode: "BT8 8FQ",
        asking_price: 42000000, bedrooms: 4, bathrooms: 4, receptions: 2,
        listing_type: "offers_around", listedDaysAgo: 40, image: img(5),
        listing_url: "https://www.propertypal.com/4-knockbracken-gardens-carryduff-belfast/1085300",
    },
    manse: {
        address_line_1: "21 Manse Park", city: "Carryduff", postcode: "BT8 8RX",
        asking_price: 29500000, bedrooms: 3, bathrooms: 3, receptions: 2,
        listing_type: "offers_around", listedDaysAgo: 45, image: img(0),
        listing_url: "https://www.propertypal.com/21-manse-park-carryduff-belfast/1083967",
    },
    castlegrange: {
        address_line_1: "34 Castlegrange", city: "Belfast", postcode: "BT5 7GT",
        asking_price: 24500000, bedrooms: 3, bathrooms: 2, receptions: 2,
        listing_type: "offers_around", listedDaysAgo: 25, image: img(1),
        listing_url: "https://www.propertypal.com/34-castlegrange-belfast/1069498",
    },
    avonvale: {
        address_line_1: "6 Avonvale", city: "Belfast", postcode: "BT4 2WA",
        asking_price: 65000000, bedrooms: 5, bathrooms: 4, receptions: 3,
        listing_type: "offers_around", listedDaysAgo: 2, image: img(2),
        listing_url: "https://www.propertypal.com/6-avonvale-belfast/1075926",
    },
    greymare: {
        address_line_1: "Grey Mare House", address_line_2: "101B Fort Road", city: "Belfast", postcode: "BT8 8LX",
        asking_price: 85000000, bedrooms: 6, bathrooms: 3, receptions: 3,
        listing_type: "fixed_price", listedDaysAgo: 3, image: img(3),
        listing_url: "https://www.propertypal.com/grey-mare-house-101b-fort-road-belfast/1049118",
    },
    thearc: {
        address_line_1: "5-49 The Arc", address_line_2: "2E Queen's Road", city: "Belfast", postcode: "BT3 9FE",
        asking_price: 30000000, bedrooms: 2, bathrooms: 2, receptions: 1,
        listing_type: "offers_around", listedDaysAgo: 6, image: img(4),
        listing_url: "https://www.propertypal.com/5-49-the-arc-2e-queens-road-belfast/1080829",
    },
    carrabhain: {
        address_line_1: "Carrabhain Manor", address_line_2: "58c Dunlady Road", city: "Craigantlet", postcode: "BT16 1TT",
        asking_price: 92500000, bedrooms: 5, bathrooms: 4, receptions: 4,
        listing_type: "fixed_price", listedDaysAgo: 12, image: img(5),
        listing_url: "https://www.propertypal.com/carrabhain-manor-58c-dunlady-road-craigantlet-belfast/1089471",
    },
};

// Standing bid terms per bidder (two-axis model). Funding varies per bid
// where noted inline.
const TERMS = {
    niamh: { position: "ftb", funding: "mortgage", flags: ["subject_to_survey"], note: null },
    niamhCoOwn: { position: "ftb", funding: "co_ownership", flags: ["subject_to_survey"], note: null },
    dan: { position: "no_chain", funding: "cash", flags: [], note: "Proof of funds available on request" },
    danPlain: { position: "no_chain", funding: "cash", flags: [], note: null },
    claire: { position: "chain", funding: "mortgage", flags: ["subject_to_survey", "flexible_completion"], note: null },
    siobhan: { position: "chain", funding: "mortgage", flags: ["flexible_completion"], note: null },
    conall: { position: "no_chain", funding: "cash", flags: [], note: null },
};

// ---------------------------------------------------------------------------

async function run() {
    const client = await pool.connect();
    try {
        console.log("hashing demo password (bcrypt cost 12)...");
        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

        await client.query("BEGIN");
        await client.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");

        // --- agencies -------------------------------------------------------
        async function makeAgent(email, name, agencyName, address, phone) {
            const r = await client.query(
                `INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, $2, $3, 'agent') RETURNING user_id`,
                [email, passwordHash, name]
            );
            const id = r.rows[0].user_id;
            await client.query(
                `INSERT INTO agent_profiles (user_id, agency_name, office_address, phone, activation_status)
                 VALUES ($1, $2, $3, $4, 'active')`,
                [id, agencyName, address, phone]
            );
            return id;
        }

        const aoifeId = await makeAgent("agent@bidchain.test", "Aoife Magee",
            "Lagan Valley Estates", "12 Arthur Street, Belfast BT1 4GD", "028 9024 0000");
        const conorId = await makeAgent("conor.agent@bidchain.test", "Conor Devlin",
            "Causeway Property Co", "4 Diamond Square, Ballymena BT43 6AA", "028 2565 0000");

        // --- vendors --------------------------------------------------------
        async function makeVendor(email, name, capacity, createdBy) {
            const r = await client.query(
                `INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, $2, $3, 'vendor') RETURNING user_id`,
                [email, passwordHash, name]
            );
            const id = r.rows[0].user_id;
            await client.query(
                `INSERT INTO vendor_profiles (user_id, vendor_capacity, created_by, activated_at)
                 VALUES ($1, $2, $3, NOW())`,
                [id, capacity, createdBy]
            );
            return id;
        }

        const seanId = await makeVendor("sean.vendor@bidchain.test", "Sean Donnelly", "owner", aoifeId);
        const maryId = await makeVendor("mary.vendor@bidchain.test", "Mary Lynch", "executor", aoifeId);
        const peterId = await makeVendor("peter.vendor@bidchain.test", "Peter Quinn", "owner", conorId);

        // --- bidders (two-axis: position on the profile; funding per bid) ---
        async function makeBidder(email, name, position) {
            const r = await client.query(
                `INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, $2, $3, 'bidder') RETURNING user_id`,
                [email, passwordHash, name]
            );
            const id = r.rows[0].user_id;
            const documentHash = createHash("sha256").update("seed-identity-document:" + email).digest("hex");
            await client.query(
                `INSERT INTO bidder_profiles (user_id, buyer_position, proof_of_funds_status, id_document_hash, submitted_at)
                 VALUES ($1, $2, 'verified', $3, NOW())`,
                [id, position, documentHash]
            );
            return id;
        }

        const niamhId = await makeBidder("niamh@bidchain.test", "Niamh O'Neill", "ftb");
        const danId = await makeBidder("dan@bidchain.test", "Dan Murphy", "no_chain");
        const claireId = await makeBidder("claire@bidchain.test", "Claire Boyd", "chain");
        const siobhanId = await makeBidder("siobhan@bidchain.test", "Siobhan Kerr", "chain");
        const conallId = await makeBidder("conall@bidchain.test", "Conall McGrath", "no_chain");
        const emerId = await makeBidder("emer@bidchain.test", "Emer Doyle", "ftb");
        const patrickId = await makeBidder("patrick@bidchain.test", "Patrick Hughes", "chain");

        // Dan is dual-role: also a vendor (chain buyer - selling while bidding).
        await client.query(
            `INSERT INTO vendor_profiles (user_id, vendor_capacity, created_by, activated_at)
             VALUES ($1, 'owner', $2, NOW())`,
            [danId, aoifeId]
        );

        // Ryan: pending review - real document on disk, no decision yet.
        const uploadDir = path.join(process.cwd(), "private", "uploads", "identity");
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, SEED_DOC_NAME), SEED_DOC_PNG);
        const seedDocHash = createHash("sha256").update(SEED_DOC_PNG).digest("hex");

        const ryanResult = await client.query(
            `INSERT INTO users (email, password_hash, name, role)
             VALUES ($1, $2, $3, 'bidder') RETURNING user_id`,
            ["ryan@bidchain.test", passwordHash, "Ryan Campbell"]
        );
        const ryanId = ryanResult.rows[0].user_id;
        await client.query(
            `INSERT INTO bidder_profiles (user_id, buyer_position, id_document_path, id_document_hash, submitted_at)
             VALUES ($1, 'ftb', $2, $3, NOW())`,
            [ryanId, SEED_DOC_NAME, seedDocHash]
        );

        // --- verification decisions (per-agency attestations) ---------------
                async function verify(bidderId, agencyId, status, reason) {
            await client.query(
                `INSERT INTO bidder_verifications (bidder_id, agency_id, status, document_hash, rejection_reason)
                 SELECT $1, $2, $3, bp.id_document_hash, $4
                 FROM bidder_profiles bp WHERE bp.user_id = $1`,
                [bidderId, agencyId, status, reason ?? null]
            );
        }
        await verify(niamhId, aoifeId, "verified");
        await verify(danId, aoifeId, "verified");
        await verify(claireId, aoifeId, "verified");
        await verify(siobhanId, aoifeId, "verified");
        await verify(danId, conorId, "verified");
        await verify(conallId, conorId, "verified");
        await verify(emerId, aoifeId, "rejected", "Document illegible - please resubmit a clearer photograph");
        // Patrick: joined participant, no document - "awaiting ID".
        // Ryan: document submitted, no decision - pending in Lagan's queue.

        // ====================================================================
        // PROPERTIES
        // ====================================================================

        // 1. Cyprus Avenue (Aoife / Sean) - OPEN. Rich ladder: four bidders,
        //    a revision, and a withdrawal.
        const cyprusId = await publishProperty(client, P.cyprus, aoifeId, seanId);
        await joinParticipant(client, cyprusId, niamhId, aoifeId, 14);
        await joinParticipant(client, cyprusId, danId, aoifeId, 13);
        await joinParticipant(client, cyprusId, claireId, aoifeId, 12);
        await joinParticipant(client, cyprusId, siobhanId, aoifeId, 12);
        const cyprusNiamh = await placeBid(client, cyprusId, niamhId, 24000000, TERMS.niamh, 11);
        await placeBid(client, cyprusId, danId, 24800000, TERMS.dan, 9);
        const cyprusSiobhan = await placeBid(client, cyprusId, siobhanId, 24650000, TERMS.siobhan, 8);
        await withdrawBid(client, cyprusId, siobhanId, cyprusSiobhan, 24650000, 7);
        await placeBid(client, cyprusId, claireId, 24950000, TERMS.claire, 6);
        await reviseBid(client, cyprusId, niamhId, cyprusNiamh, 24000000, 25100000, TERMS.niamh, 5);
        await client.query(
            `INSERT INTO property_participants (property_id, user_id, status, invited_by)
             VALUES ($1, $2, 'invited', $3)`,
            [cyprusId, ryanId, aoifeId]
        );
        await joinParticipant(client, cyprusId, patrickId, aoifeId, 5);

        // 2. Pasadena Gardens (Aoife / Mary, executor) - OPEN, joined, no bids
        //    yet (the empty-ladder state).
        const pasadenaId = await publishProperty(client, P.pasadena, aoifeId, maryId);
        await joinParticipant(client, pasadenaId, siobhanId, aoifeId, 7);
        await joinParticipant(client, pasadenaId, claireId, aoifeId, 6);

        // 3. Sandhill Gardens (Aoife / Sean) - CLOSED, awaiting vendor decision.
        const sandhillId = await publishProperty(client, P.sandhill, aoifeId, seanId);
        await joinParticipant(client, sandhillId, niamhId, aoifeId, 19);
        await joinParticipant(client, sandhillId, siobhanId, aoifeId, 18);
        const sandhillNiamh = await placeBid(client, sandhillId, niamhId, 43000000, TERMS.niamh, 16);
        await placeBid(client, sandhillId, siobhanId, 44250000, TERMS.siobhan, 13);
        await reviseBid(client, sandhillId, niamhId, sandhillNiamh, 43000000, 44500000, TERMS.niamh, 10);
        await closeBidding(client, sandhillId, aoifeId, 2);

        // 4. Baronscourt Heights (Aoife / Mary) - SALE AGREED.
        const baronscourtId = await publishProperty(client, P.baronscourt, aoifeId, maryId);
        await joinParticipant(client, baronscourtId, claireId, aoifeId, 28);
        await joinParticipant(client, baronscourtId, danId, aoifeId, 27);
        const baronsClaire = await placeBid(client, baronscourtId, claireId, 48500000, TERMS.claire, 25);
        const baronsDan = await placeBid(client, baronscourtId, danId, 47750000, TERMS.danPlain, 24);
        await reviseBid(client, baronscourtId, danId, baronsDan, 47750000, 48200000, TERMS.danPlain, 22);
        await closeBidding(client, baronscourtId, aoifeId, 20);
        await acceptOffer(client, baronscourtId, maryId, baronsClaire, 48500000, 18);

        // 5. Black Quarter Meadow (Aoife / Sean) - COMPLETED (full happy path).
        const blackquarterId = await publishProperty(client, P.blackquarter, aoifeId, seanId);
        await joinParticipant(client, blackquarterId, niamhId, aoifeId, 52);
        await joinParticipant(client, blackquarterId, claireId, aoifeId, 51);
        const bqNiamh = await placeBid(client, blackquarterId, niamhId, 39500000, TERMS.niamh, 50);
        const bqClaire = await placeBid(client, blackquarterId, claireId, 41250000, TERMS.claire, 48);
        await reviseBid(client, blackquarterId, niamhId, bqNiamh, 39500000, 40500000, TERMS.niamh, 46);
        await closeBidding(client, blackquarterId, aoifeId, 45);
        await acceptOffer(client, blackquarterId, seanId, bqClaire, 41250000, 43);
        await completeSale(client, blackquarterId, aoifeId, 4);

        // 6. Knockbracken Gardens (Aoife / Mary) - COLLAPSED (buyer, survey).
        const knockbrackenId = await publishProperty(client, P.knockbracken, aoifeId, maryId);
        await joinParticipant(client, knockbrackenId, danId, aoifeId, 38);
        await joinParticipant(client, knockbrackenId, siobhanId, aoifeId, 37);
        const kbDan = await placeBid(client, knockbrackenId, danId, 41500000, TERMS.danPlain, 35);
        await placeBid(client, knockbrackenId, siobhanId, 40800000, TERMS.siobhan, 33);
        await closeBidding(client, knockbrackenId, aoifeId, 30);
        await acceptOffer(client, knockbrackenId, maryId, kbDan, 41500000, 28);
        await collapseSale(client, knockbrackenId, danId, kbDan, 41500000, "buyer", "survey", 10);

        // 7. Manse Park (Aoife / Sean) - COLLAPSED then RELISTED lower:
        //    participants lapsed, Siobhan re-invited.
        const manseId = await publishProperty(client, P.manse, aoifeId, seanId);
        await joinParticipant(client, manseId, siobhanId, aoifeId, 43);
        await joinParticipant(client, manseId, claireId, aoifeId, 42);
        const manseSiobhan = await placeBid(client, manseId, siobhanId, 29750000, TERMS.siobhan, 40);
        await placeBid(client, manseId, claireId, 29000000, TERMS.claire, 38);
        await closeBidding(client, manseId, aoifeId, 35);
        await acceptOffer(client, manseId, seanId, manseSiobhan, 29750000, 33);
        await collapseSale(client, manseId, seanId, manseSiobhan, 29750000, "vendor", "chain_collapse", 15);
        await relistProperty(client, manseId, aoifeId, 29500000, 28500000, 8);
        await client.query(
            `UPDATE property_participants SET status = 'invited' WHERE property_id = $1 AND user_id = $2`,
            [manseId, siobhanId]
        );

        // 8. Castlegrange (Aoife / Mary) - WITHDRAWN after one bid. Niamh bids
        //    via Co-Ownership (the NI scheme, first-class funding value).
        const castlegrangeId = await publishProperty(client, P.castlegrange, aoifeId, maryId);
        await joinParticipant(client, castlegrangeId, niamhId, aoifeId, 23);
        await placeBid(client, castlegrangeId, niamhId, 24000000, TERMS.niamhCoOwn, 21);
        await withdrawListing(client, castlegrangeId, aoifeId, "no_longer_selling", 12);

        // 9. Avonvale (Aoife) - DRAFT, vendor invitation outstanding.
        const avonvaleId = await createDraft(client, P.avonvale, aoifeId, null);
        await client.query(
            `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
             VALUES ($1, $2, 'vendor_activation', $3, $4, $5)`,
            [makeTokenHash(), "aoibhinn.vendor@bidchain.test", avonvaleId, aoifeId, inviteExpiry()]
        );

        // 10. Grey Mare House (Aoife / Dan) - DRAFT, vendor attached, ready to
        //     publish. Dan the chain buyer: selling here, bidding elsewhere.
        await createDraft(client, P.greymare, aoifeId, danId);

        // 11. The Arc (Conor / Peter) - OPEN with bids + an outstanding bidder
        //     invitation to an email with no account (ghost row).
        const arcId = await publishProperty(client, P.thearc, conorId, peterId);
        await joinParticipant(client, arcId, conallId, conorId, 5);
        await joinParticipant(client, arcId, danId, conorId, 4);
        await placeBid(client, arcId, conallId, 29500000, TERMS.conall, 3);
        await placeBid(client, arcId, danId, 29200000, TERMS.danPlain, 2);
        await client.query(
            `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
             VALUES ($1, $2, 'bidder_invite', $3, $4, $5)`,
            [makeTokenHash(), "fionn@bidchain.test", arcId, conorId, inviteExpiry()]
        );

        // 12. Carrabhain Manor (Conor / Peter) - OPEN with a competitive ladder;
        //     Dan bids under his Causeway verification (per-agency scoping).
        const carrabhainId = await publishProperty(client, P.carrabhain, conorId, peterId);
        await joinParticipant(client, carrabhainId, conallId, conorId, 10);
        await joinParticipant(client, carrabhainId, danId, conorId, 9);
        const carraConall = await placeBid(client, carrabhainId, conallId, 90000000, TERMS.conall, 8);
        await placeBid(client, carrabhainId, danId, 91500000, TERMS.dan, 5);
        await reviseBid(client, carrabhainId, conallId, carraConall, 90000000, 92100000, TERMS.conall, 3);

        await client.query("COMMIT");

        // --- verify every chain before declaring success --------------------
        console.log("");
        const allProps = await client.query(`SELECT property_id, address_line_1 FROM properties ORDER BY property_id`);
        let allValid = true;
        for (const prop of allProps.rows) {
            const check = await verifyChain(client, prop.property_id);
            const label = prop.address_line_1.padEnd(28);
            if (check.count === 0) {
                console.log(`-  ${label} draft (no chain)`);
            } else if (check.valid) {
                console.log(`✅ ${label} chain valid (${check.count} event${check.count === 1 ? "" : "s"})`);
            } else {
                allValid = false;
                console.log(`❌ ${label} INVALID: ${JSON.stringify(check.failures)}`);
            }
        }
        if (!allValid) {
            throw new Error("seeded chains failed verification - do not demo against this data");
        }

        console.log(`
Seed complete. Demo logins (password for all: ${DEMO_PASSWORD})

  AGENCIES
    agent@bidchain.test          Aoife Magee - Lagan Valley Estates
    conor.agent@bidchain.test    Conor Devlin - Causeway Property Co

  BIDDERS (position / typical funding)
    niamh@bidchain.test          FTB / mortgage (Co-Ownership on Castlegrange)
    dan@bidchain.test            DUAL ROLE - nothing to sell / cash; selling Grey Mare House
    claire@bidchain.test         in a chain / mortgage
    siobhan@bidchain.test        in a chain / mortgage; withdrew on Cyprus; lapsed then re-invited on Manse Park
    conall@bidchain.test         nothing to sell / cash (Causeway only)
    emer@bidchain.test           REJECTED by Lagan (resubmission demo)
    patrick@bidchain.test        joined, no ID document yet
    ryan@bidchain.test           PENDING review (document in Lagan queue)

  VENDORS
    sean.vendor@bidchain.test    Cyprus Ave, Sandhill (decision due), Black Quarter (sold), Manse Park (relisted)
    mary.vendor@bidchain.test    executor: Pasadena, Baronscourt (sale agreed), Knockbracken (collapsed), Castlegrange (withdrawn)
    peter.vendor@bidchain.test   Causeway: The Arc, Carrabhain Manor

  OUTSTANDING INVITATIONS (tokens not recoverable - re-send live in demo)
    aoibhinn.vendor@bidchain.test   vendor activation for Avonvale draft
    fionn@bidchain.test             bidder invite to The Arc
`);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch((err) => {
    console.error("SEED FAILED:", err.message);
    process.exit(1);
});