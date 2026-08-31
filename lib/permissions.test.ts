import { afterAll, beforeAll, describe, expect, test } from "vitest";
import pool from "./db";
import {
    canBidOn, canManageProperty, canViewIdDocument, canViewOffers,
    hasBidderProfile, hasVendorProfile, isActiveAgency, isPropertyVendor, isVerifiedForProperty,
} from "./permissions";

let agentId: number;
let pendingAgentId: number;
let verifiedBidderId: number;
let unverifiedBidderId: number;
let vendorId: number;
let strangerId: number;
let propertyId: number;

async function makeUser(email: string, role: string): Promise<number> {
    const result = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1, 'x', $1, $2)
        ON CONFLICT (email) DO UPDATE SET role = $2 RETURNING user_id`,
        [email, role]
    );
    return result.rows[0].user_id;
}

beforeAll(async () => {
    agentId = await makeUser("perm.agent@bidchain.test", "agent");
    pendingAgentId = await makeUser("perm.pending@bidchain.test", "agent");
    verifiedBidderId = await makeUser("perm.verified@bidchain.test", "bidder");
    unverifiedBidderId = await makeUser("perm.unverified@bidchain.test", "bidder");
    vendorId = await makeUser("perm.vendor@bidchain.test", "vendor");
    strangerId = await makeUser("perm.stranger@bidchain.test", "bidder");

    await pool.query(
        `INSERT INTO agent_profiles (user_id, agency_name, activation_status)
        VALUES ($1, 'Test Agency', 'active'), ($2, 'Pending Agency', 'pending')
        ON CONFLICT (user_id) DO NOTHING`,
        [agentId, pendingAgentId]
    );
    await pool.query(
        `INSERT INTO bidder_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [verifiedBidderId]
    );
    await pool.query(
        `INSERT INTO vendor_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [vendorId]
    );

    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, vendor_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, $2, '2 Permission Row', 'Belfast', 'BT2 2BB', 15000000, 'offers_over', 'active', 'open')
        RETURNING property_id`,
        [agentId, vendorId]
    );
    propertyId = property.rows[0].property_id;

    await pool.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by)
        VALUES ($1, $2, 'joined', $4), ($1, $3, 'joined', $4)`,
        [propertyId, verifiedBidderId, unverifiedBidderId, agentId]
    );
    await pool.query(
        `INSERT INTO bidder_verifications (bidder_id, agency_id, status, document_hash)
        VALUES ($1, $2, 'verified', 'abc123') ON CONFLICT (bidder_id, agency_id) DO NOTHING`,
        [verifiedBidderId, agentId]
    );
});

afterAll(async () => {
    await pool.query(`DELETE FROM bidder_verifications WHERE agency_id = $1`, [agentId]);
    await pool.query(`DELETE FROM property_participants WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM properties WHERE property_id = $1`, [propertyId]);
    await pool.query(`DELETE FROM agent_profiles WHERE user_id IN ($1, $2)`, [agentId, pendingAgentId]);
    await pool.query(`DELETE FROM bidder_profiles WHERE user_id = $1`, [verifiedBidderId]);
    await pool.query(`DELETE FROM vendor_profiles WHERE user_id = $1`, [vendorId]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'perm.%@bidchain.test'`);
    await pool.end();
});

describe("property relationships", () => {
    test("canManageProperty is true only for the managing agent", async () => {
        expect(await canManageProperty(propertyId, agentId)).toBe(true);
        expect(await canManageProperty(propertyId, strangerId)).toBe(false);
    });

    test("isPropertyVendor is true only for the attached vendor", async () => {
        expect(await isPropertyVendor(propertyId, vendorId)).toBe(true);
        expect(await isPropertyVendor(propertyId, verifiedBidderId)).toBe(false);
    });
});

describe("bidding capability", () => {
    test("joined and agency-verified bidder can bid", async () => {
        expect(await canBidOn(propertyId, verifiedBidderId)).toBe(true);
    });

    test("joined but unverified bidder cannot bid", async () => {
        expect(await canBidOn(propertyId, unverifiedBidderId)).toBe(false);
    });

    test("non-participant cannot bid regardless of verification", async () => {
        expect(await canBidOn(propertyId, strangerId)).toBe(false);
    });

    test("verification is per-agency: this agency's attestation counts, absence does not", async () => {
        expect(await isVerifiedForProperty(propertyId, verifiedBidderId)).toBe(true);
        expect(await isVerifiedForProperty(propertyId, unverifiedBidderId)).toBe(false);
    });
});

describe("offer visibility", () => {
    test("joined bidder, vendor, and agent can view; stranger cannot", async () => {
        expect(await canViewOffers(propertyId, verifiedBidderId)).toBe(true);
        expect(await canViewOffers(propertyId, vendorId)).toBe(true);
        expect(await canViewOffers(propertyId, agentId)).toBe(true);
        expect(await canViewOffers(propertyId, strangerId)).toBe(false);
    });
});

describe("identity document access", () => {
    test("admin and the owner may view", async () => {
        expect(await canViewIdDocument({ id: "1", role: "admin" }, verifiedBidderId)).toBe(true);
        expect(await canViewIdDocument({ id: String(verifiedBidderId), role: "bidder" }, verifiedBidderId)).toBe(true);
    });

    test("an agent may view only bidders participating on their properties", async () => {
        expect(await canViewIdDocument({ id: String(agentId), role: "agent" }, verifiedBidderId)).toBe(true);
        expect(await canViewIdDocument({ id: String(pendingAgentId), role: "agent" }, verifiedBidderId)).toBe(false);
    });

    test("other bidders may not view", async () => {
        expect(await canViewIdDocument({ id: String(strangerId), role: "bidder" }, verifiedBidderId)).toBe(false);
    });
});

describe("capability from profiles and agency activation", () => {
    test("isActiveAgency requires an active profile", async () => {
        expect(await isActiveAgency(agentId)).toBe(true);
        expect(await isActiveAgency(pendingAgentId)).toBe(false);
        expect(await isActiveAgency(strangerId)).toBe(false);
    });

    test("capability is profile presence", async () => {
        expect(await hasBidderProfile(verifiedBidderId)).toBe(true);
        expect(await hasBidderProfile(vendorId)).toBe(false);
        expect(await hasVendorProfile(vendorId)).toBe(true);
        expect(await hasVendorProfile(verifiedBidderId)).toBe(false);
    });
});