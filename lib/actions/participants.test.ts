import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));

import pool from "@/lib/db";
import { auth } from "@/auth";
import { acceptInvitation, cancelInvitation, inviteBidder } from "@/lib/actions/participants";
import { hashToken } from "@/lib/invitations";

let agentId: number;
let propertyId: number;
let draftId: number;

function signInAs(userId: number, role: string, email: string): void {
    vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), role: role, email: email } } as never);
}

async function makeUser(email: string, role: string): Promise<number> {
    const result = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1, 'x', $1, $2)
        ON CONFLICT (email) DO UPDATE SET role = $2 RETURNING user_id`, [email, role]
    );
    return result.rows[0].user_id;
}

beforeAll(async () => {
    agentId = await makeUser("part.agent@bidchain.test", "agent");
    await pool.query(
        `INSERT INTO agent_profiles (user_id, agency_name, activation_status) VALUES ($1, 'Part Agency', 'active')
        ON CONFLICT (user_id) DO NOTHING`, [agentId]
    );
    const property = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '7 Invite Close', 'Belfast', 'BT7 7GG', 20000000, 'offers_over', 'active', 'open') RETURNING property_id`,
        [agentId]
    );
    propertyId = property.rows[0].property_id;
    const draft = await pool.query<{ property_id: number }>(
        `INSERT INTO properties (agent_id, address_line_1, city, postcode, asking_price, listing_type, status, state)
        VALUES ($1, '8 Draft Close', 'Belfast', 'BT8 8HH', 20000000, 'offers_over', 'active', 'draft') RETURNING property_id`,
        [agentId]
    );
    draftId = draft.rows[0].property_id;
});

afterAll(async () => {
    await pool.query(`DELETE FROM invitations WHERE property_id IN ($1, $2)`, [propertyId, draftId]);
    await pool.query(`DELETE FROM property_participants WHERE property_id IN ($1, $2)`, [propertyId, draftId]);
    await pool.query(`DELETE FROM properties WHERE property_id IN ($1, $2)`, [propertyId, draftId]);
    await pool.query(`DELETE FROM bidder_profiles WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE 'part.%@bidchain.test')`);
    await pool.query(`DELETE FROM vendor_profiles WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE 'part.%@bidchain.test')`);
    await pool.query(`DELETE FROM agent_profiles WHERE user_id = $1`, [agentId]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'part.%@bidchain.test'`);
    await pool.end();
});

describe("inviteBidder", () => {
    test("creates the invitation and the invited participant", async () => {
        signInAs(agentId, "agent", "part.agent@bidchain.test");
        const form = new FormData();
        form.set("email", "part.invitee@bidchain.test");
        const result = await inviteBidder(propertyId, null, form);
        expect(result).not.toHaveProperty("error");
        const invites = await pool.query(
            `SELECT * FROM invitations WHERE property_id = $1 AND email = 'part.invitee@bidchain.test' AND accepted_at IS NULL`,
            [propertyId]
        );
        expect(invites.rows.length).toBe(1);
    });
});

describe("acceptInvitation", () => {
    test("a valid token joins the signed-in invitee and burns the token", async () => {
        const token = "part-token-join";
        await pool.query(
            `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
            VALUES ($1, 'part.joiner@bidchain.test', 'bidder_invite', $2, $3, NOW() + interval '1 day')`,
            [hashToken(token), propertyId, agentId]
        );
        const joinerId = await makeUser("part.joiner@bidchain.test", "bidder");
        signInAs(joinerId, "bidder", "part.joiner@bidchain.test");

        await expect(acceptInvitation(token, null, new FormData())).rejects.toThrow("REDIRECT:");

        const participant = await pool.query<{ status: string }>(
            `SELECT status FROM property_participants WHERE property_id = $1 AND user_id = $2`, [propertyId, joinerId]
        );
        expect(participant.rows[0].status).toBe("joined");
        const second = await acceptInvitation(token, null, new FormData());
        expect(second).toHaveProperty("error");
    });

    test("the wrong signed-in email is refused", async () => {
        const token = "part-token-wrongmail";
        await pool.query(
            `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
            VALUES ($1, 'part.someoneelse@bidchain.test', 'bidder_invite', $2, $3, NOW() + interval '1 day')`,
            [hashToken(token), propertyId, agentId]
        );
        const wrongId = await makeUser("part.wrong@bidchain.test", "bidder");
        signInAs(wrongId, "bidder", "part.wrong@bidchain.test");
        expect(await acceptInvitation(token, null, new FormData())).toHaveProperty("error");
    });

    test("an expired token is refused", async () => {
        const token = "part-token-expired";
        await pool.query(
            `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
            VALUES ($1, 'part.late@bidchain.test', 'bidder_invite', $2, $3, NOW() - interval '1 day')`,
            [hashToken(token), propertyId, agentId]
        );
        const lateId = await makeUser("part.late@bidchain.test", "bidder");
        signInAs(lateId, "bidder", "part.late@bidchain.test");
        expect(await acceptInvitation(token, null, new FormData())).toHaveProperty("error");
    });

    test("vendor activation attaches the vendor to the draft", async () => {
        const token = "part-token-vendor";
        await pool.query(
            `INSERT INTO invitations (token_hash, email, purpose, property_id, created_by, expires_at)
            VALUES ($1, 'part.vendor@bidchain.test', 'vendor_activation', $2, $3, NOW() + interval '1 day')`,
            [hashToken(token), draftId, agentId]
        );
        const vendorUserId = await makeUser("part.vendor@bidchain.test", "vendor");
        signInAs(vendorUserId, "vendor", "part.vendor@bidchain.test");

        await expect(acceptInvitation(token, null, new FormData())).rejects.toThrow("REDIRECT:");
        const property = await pool.query<{ vendor_id: number | null }>(
            `SELECT vendor_id FROM properties WHERE property_id = $1`, [draftId]
        );
        expect(property.rows[0].vendor_id).toBe(vendorUserId);
    });
});

describe("cancelInvitation", () => {
    test("revokes the pending invitation and removes the invited participant", async () => {
        signInAs(agentId, "agent", "part.agent@bidchain.test");
        const result = await cancelInvitation(propertyId, "part.invitee@bidchain.test", null, new FormData());
        expect(result).not.toHaveProperty("error");
        const invites = await pool.query(
            `SELECT * FROM invitations WHERE property_id = $1 AND email = 'part.invitee@bidchain.test' AND accepted_at IS NULL`,
            [propertyId]
        );
        expect(invites.rows.length).toBe(0);
    });
});