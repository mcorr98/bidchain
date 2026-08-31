import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));

import bcrypt from "bcrypt";
import pool from "@/lib/db";
import { auth, signOut } from "@/auth";
import { changeEmail, changePassword, registerAccount } from "@/lib/actions/accounts";
import { hashToken } from "@/lib/invitations";

let inviterId: number;

function signInAs(userId: number, role: string, email: string): void {
    vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), role: role, email: email } } as never);
}

function regForm(name: string, email: string, password: string, inviteToken?: string): FormData {
    const form = new FormData();
    form.set("name", name);
    form.set("email", email);
    form.set("password", password);
    form.set("password_confirm", password);
    if (inviteToken !== undefined) {
        form.set("invite_token", inviteToken);
    }
    return form;
}

beforeAll(async () => {
    const inviter = await pool.query<{ user_id: number }>(
        `INSERT INTO users (email, password_hash, name, role) VALUES ('acc.inviter@bidchain.test', 'x', 'Inviter', 'agent')
        ON CONFLICT (email) DO UPDATE SET name = 'Inviter' RETURNING user_id`
    );
    inviterId = inviter.rows[0].user_id;
});

afterAll(async () => {
    await pool.query(`DELETE FROM invitations WHERE email LIKE 'acc.%@bidchain.test'`);
    await pool.query(`DELETE FROM bidder_profiles WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE 'acc.%@bidchain.test')`);
    await pool.query(`DELETE FROM users WHERE email LIKE 'acc.%@bidchain.test'`);
    await pool.end();
});

describe("registerAccount", () => {
    test("open registration creates a bidder with a profile, never anything else", async () => {
        await expect(registerAccount(null, regForm("New Bidder", "acc.bidder@bidchain.test", "longenough1")))
            .rejects.toThrow("REDIRECT:/login");
        const user = await pool.query<{ user_id: number; role: string }>(
            `SELECT user_id, role FROM users WHERE email = 'acc.bidder@bidchain.test'`
        );
        expect(user.rows[0].role).toBe("bidder");
        const profile = await pool.query(`SELECT * FROM bidder_profiles WHERE user_id = $1`, [user.rows[0].user_id]);
        expect(profile.rows.length).toBe(1);
    });

    test("a vendor invitation token grants the vendor role", async () => {
        const token = "acc-test-token-vendor";
        await pool.query(
            `INSERT INTO invitations (token_hash, email, purpose, created_by, expires_at)
            VALUES ($1, 'acc.vendor@bidchain.test', 'vendor_activation', $2, NOW() + interval '1 day')`,
            [hashToken(token), inviterId]
        );
        await expect(registerAccount(null, regForm("New Vendor", "acc.vendor@bidchain.test", "longenough1", token)))
            .rejects.toThrow("REDIRECT:/login");
        const user = await pool.query<{ role: string }>(`SELECT role FROM users WHERE email = 'acc.vendor@bidchain.test'`);
        expect(user.rows[0].role).toBe("vendor");
    });

    test("an invitation cannot be used from a different email address", async () => {
        const token = "acc-test-token-wrongmail";
        await pool.query(
            `INSERT INTO invitations (token_hash, email, purpose, created_by, expires_at)
            VALUES ($1, 'acc.intended@bidchain.test', 'vendor_activation', $2, NOW() + interval '1 day')`,
            [hashToken(token), inviterId]
        );
        const result = await registerAccount(null, regForm("Wrong Mail", "acc.impostor@bidchain.test", "longenough1", token));
        expect(result).toHaveProperty("error");
    });

    test("duplicate email is refused cleanly", async () => {
        const result = await registerAccount(null, regForm("Again", "acc.bidder@bidchain.test", "longenough1"));
        expect(result).toHaveProperty("error");
    });

    test("short passwords and mismatched confirmations are refused", async () => {
        expect(await registerAccount(null, regForm("Shorty", "acc.short@bidchain.test", "tiny"))).toHaveProperty("error");
        const mismatch = regForm("Mismatch", "acc.mismatch@bidchain.test", "longenough1");
        mismatch.set("password_confirm", "different11");
        expect(await registerAccount(null, mismatch)).toHaveProperty("error");
    });
});

describe("credential changes", () => {
    test("changePassword requires the current password and rebinds the hash", async () => {
        const originalHash = await bcrypt.hash("originalpw1", 12);
        const user = await pool.query<{ user_id: number }>(
            `INSERT INTO users (email, password_hash, name, role) VALUES ('acc.change@bidchain.test', $1, 'Changer', 'bidder')
            RETURNING user_id`, [originalHash]
        );
        const userId = user.rows[0].user_id;
        signInAs(userId, "bidder", "acc.change@bidchain.test");

        const wrong = new FormData();
        wrong.set("current_password", "notmypassword");
        wrong.set("new_password", "brandnewpw1");
        wrong.set("confirm_password", "brandnewpw1");
        expect(await changePassword(null, wrong)).toHaveProperty("error");

        const right = new FormData();
        right.set("current_password", "originalpw1");
        right.set("new_password", "brandnewpw1");
        right.set("confirm_password", "brandnewpw1");
        const result = await changePassword(null, right);
        expect(result).not.toHaveProperty("error");

        const stored = await pool.query<{ password_hash: string }>(
            `SELECT password_hash FROM users WHERE user_id = $1`, [userId]
        );
        expect(await bcrypt.compare("brandnewpw1", stored.rows[0].password_hash)).toBe(true);
    });

    test("changeEmail re-authenticates, rebinds the handle, and forces sign-out", async () => {
        const hash = await bcrypt.hash("mypassword1", 12);
        const user = await pool.query<{ user_id: number }>(
            `INSERT INTO users (email, password_hash, name, role) VALUES ('acc.oldmail@bidchain.test', $1, 'Mover', 'bidder')
            RETURNING user_id`, [hash]
        );
        const userId = user.rows[0].user_id;
        signInAs(userId, "bidder", "acc.oldmail@bidchain.test");

        const form = new FormData();
        form.set("new_email", "acc.newmail@bidchain.test");
        form.set("current_password", "mypassword1");
        await changeEmail(null, form);

        const stored = await pool.query<{ email: string }>(`SELECT email FROM users WHERE user_id = $1`, [userId]);
        expect(stored.rows[0].email).toBe("acc.newmail@bidchain.test");
        expect(vi.mocked(signOut)).toHaveBeenCalled();
    });
});