import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));

import pool from "@/lib/db";
import { auth } from "@/auth";
import {
    acceptBid, closeBidding, collapseSale, completeSale, publishListing,
    relistProperty, replaceVendorInvitation, updateDraftListing, withdrawListing,
} from "@/lib/actions/lifecycle";
import { placeBid } from "@/lib/actions/bids";
import { EventRow, verifyChain } from "@/lib/chain";

let agentId: number;
let vendorId: number;
let bidderId: number;
const propertyIds: number[] = [];

function signInAs(userId: number, role: string): void {
    vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), role: role } } as never);
}

async function makeUser(email: string, role: string): Promise<number> {
    const result = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1, 'x', $1, $2)
        ON CONFLICT (email) DO UPDATE SET role = $2 RETURNING user_id`,
        [email, role]
    );
    return result.rows[0].user_id;
}

async function newDraft(withVendor: boolean): Promise<number> {
    let attachedVendor: number | null = null;
    if (withVendor) {
        attachedVendor = vendorId;
    }
    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, vendor_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, $2, '6 Walk Gardens', 'Belfast', 'BT6 6FF', 20000000, 'offers_over', 'active', 'draft')
        RETURNING property_id`,
        [agentId, attachedVendor]
    );
    const id = property.rows[0].property_id;
    propertyIds.push(id);
    await pool.query(
        `INSERT INTO property_participants (property_id, user_id, status, invited_by) VALUES ($1, $2, 'joined', $3)`,
        [id, bidderId, agentId]
    );
    return id;
}

function bidForm(pounds: number): FormData {
    const form = new FormData();
    form.set("amount", String(pounds));
    form.set("buyer_position", "ftb");
    form.set("funding", "mortgage");
    return form;
}

function reasonForm(reason: string): FormData {
    const form = new FormData();
    form.set("reason", reason);
    return form;
}

async function chainOf(propertyId: number): Promise<EventRow[]> {
    const rows = await pool.query<EventRow>(
        `SELECT * FROM events WHERE property_id = $1 ORDER BY sequence`, [propertyId]
    );
    return rows.rows;
}

async function stateOf(propertyId: number): Promise<string> {
    const rows = await pool.query<{ state: string }>(
        `SELECT state FROM properties WHERE property_id = $1`, [propertyId]
    );
    return rows.rows[0].state;
}

async function placeAndClose(propertyId: number, pounds: number): Promise<number> {
    signInAs(agentId, "agent");
    expect(await publishListing(propertyId, null, new FormData())).toHaveProperty("success");
    signInAs(bidderId, "bidder");
    expect(await placeBid(propertyId, null, bidForm(pounds))).toHaveProperty("success");
    signInAs(agentId, "agent");
    expect(await closeBidding(propertyId, null, new FormData())).toHaveProperty("success");
    const offer = await pool.query<{ offer_id: number }>(
        `SELECT offer_id FROM offers WHERE property_id = $1 AND status = 'active'`, [propertyId]
    );
    return offer.rows[0].offer_id;
}

beforeAll(async () => {
    agentId = await makeUser("walk.agent@bidchain.test", "agent");
    await pool.query(
        `INSERT INTO agent_profiles (user_id, agency_name, activation_status) VALUES ($1, 'Walk Agency', 'active')
        ON CONFLICT (user_id) DO NOTHING`, [agentId]
    );
    vendorId = await makeUser("walk.vendor@bidchain.test", "vendor");
    await pool.query(`INSERT INTO vendor_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [vendorId]);
    bidderId = await makeUser("walk.bidder@bidchain.test", "bidder");
    await pool.query(`INSERT INTO bidder_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [bidderId]);
    await pool.query(
        `INSERT INTO bidder_verifications (bidder_id, agency_id, status, document_hash) VALUES ($1, $2, 'verified', 'wh1')
        ON CONFLICT (bidder_id, agency_id) DO NOTHING`, [bidderId, agentId]
    );
});

afterAll(async () => {
    for (const id of propertyIds) {
        await pool.query(`DELETE FROM events WHERE property_id = $1`, [id]);
        await pool.query(`DELETE FROM offers WHERE property_id = $1`, [id]);
        await pool.query(`DELETE FROM property_participants WHERE property_id = $1`, [id]);
        await pool.query(`DELETE FROM invitations WHERE property_id = $1`, [id]);
        await pool.query(`DELETE FROM properties WHERE property_id = $1`, [id]);
    }
    await pool.query(`DELETE FROM bidder_verifications WHERE agency_id = $1`, [agentId]);
    await pool.query(`DELETE FROM bidder_profiles WHERE user_id = $1`, [bidderId]);
    await pool.query(`DELETE FROM vendor_profiles WHERE user_id = $1`, [vendorId]);
    await pool.query(`DELETE FROM agent_profiles WHERE user_id = $1`, [agentId]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'walk.%@bidchain.test'`);
    await pool.end();
});

describe("full lifecycle: draft to completion", () => {
    test("edit, publish, bid, close, accept, complete - chain verifies throughout", async () => {
        const propertyId = await newDraft(true);

        signInAs(agentId, "agent");
        const editForm = new FormData();
        editForm.set("address_line_1", "6 Walk Gardens");
        editForm.set("city", "Belfast");
        editForm.set("postcode", "BT6 6FF");
        editForm.set("asking_price", "210000");
        editForm.set("listing_type", "offers_over");
        expect(await updateDraftListing(propertyId, null, editForm)).toHaveProperty("success");

        const offerId = await placeAndClose(propertyId, 215000);

        signInAs(vendorId, "vendor");
        expect(await acceptBid(propertyId, offerId, null, new FormData())).toHaveProperty("success");
        expect(await stateOf(propertyId)).toBe("sale_agreed");

        signInAs(agentId, "agent");
        expect(await completeSale(propertyId, null, new FormData())).toHaveProperty("success");
        expect(await stateOf(propertyId)).toBe("completed");

        const chain = await chainOf(propertyId);
        expect(chain.map((e) => e.event_type)).toEqual([
            "LISTING_CREATED", "BID_PLACED", "BIDDING_CLOSED", "BID_ACCEPTED", "SALE_COMPLETED",
        ]);
        expect(chain[0].details).toMatchObject({ asking_price_snapshot: 21000000 });
        expect(verifyChain(chain).valid).toBe(true);
    });
});

describe("full lifecycle: collapse and relist", () => {
    test("vendor collapse records reason; relist snapshots both prices", async () => {
        const propertyId = await newDraft(true);
        const offerId = await placeAndClose(propertyId, 220000);

        signInAs(vendorId, "vendor");
        expect(await acceptBid(propertyId, offerId, null, new FormData())).toHaveProperty("success");
        expect(await collapseSale(propertyId, null, reasonForm("no_longer_selling"))).toHaveProperty("success");
        expect(await stateOf(propertyId)).toBe("collapsed");

        signInAs(agentId, "agent");
        const relistForm = new FormData();
        relistForm.set("asking_price", "195000");
        expect(await relistProperty(propertyId, null, relistForm)).toHaveProperty("success");
        expect(await stateOf(propertyId)).toBe("open");

        const chain = await chainOf(propertyId);
        const collapse = chain.find((e) => e.event_type === "SALE_COLLAPSED");
        const relist = chain.find((e) => e.event_type === "PROPERTY_RELISTED");
        expect(collapse?.details).toMatchObject({ reason: "no_longer_selling", initiated_by: "vendor" });
        expect(relist?.details).toMatchObject({ previous_asking_price: 20000000, new_asking_price: 19500000 });
        expect(verifyChain(chain).valid).toBe(true);
    });
});

describe("withdrawal and vendor replacement", () => {
    test("an open listing withdraws with an enumerated reason", async () => {
        const propertyId = await newDraft(true);
        signInAs(agentId, "agent");
        expect(await publishListing(propertyId, null, new FormData())).toHaveProperty("success");
        expect(await withdrawListing(propertyId, null, reasonForm("selling_privately"))).toHaveProperty("success");
        expect(await stateOf(propertyId)).toBe("withdrawn");
        expect(verifyChain(await chainOf(propertyId)).valid).toBe(true);
    });

    test("replacing the vendor invitation revokes and reissues", async () => {
        const propertyId = await newDraft(false);
        signInAs(agentId, "agent");
        const form = new FormData();
        form.set("vendor_email", "walk.newvendor@example.test");
        expect(await replaceVendorInvitation(propertyId, null, form)).toHaveProperty("success");
        const invites = await pool.query(
            `SELECT * FROM invitations WHERE property_id = $1 AND accepted_at IS NULL`, [propertyId]
        );
        expect(invites.rows.length).toBe(1);
    });
});