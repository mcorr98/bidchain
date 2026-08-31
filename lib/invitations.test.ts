import { describe, expect, test, vi } from "vitest";
import { hashToken, invitationExpiry, invitationLink, makeInvitationToken } from "./invitations";

describe("invitation tokens", () => {
    test("tokens are 256-bit hex and unique", () => {
        const a = makeInvitationToken();
        const b = makeInvitationToken();
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(a).not.toBe(b);
    });

    test("hashToken is deterministic SHA-256", () => {
        expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        expect(hashToken("abc")).toBe(hashToken("abc"));
    });

    test("expiry is seven days out", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
        expect(invitationExpiry()).toBe("2026-09-03T12:00:00.000Z");
        vi.useRealTimers();
    });

    test("invitationLink builds from the app url and fails fast without one", () => {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
        expect(invitationLink("tok123")).toBe("http://localhost:3000/invite/tok123");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
        expect(() => invitationLink("tok123")).toThrow();
    });
});