import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    test("allows up to the limit and blocks the next attempt", () => {
        expect(rateLimit("t1", 3, 60_000)).toBe(true);
        expect(rateLimit("t1", 3, 60_000)).toBe(true);
        expect(rateLimit("t1", 3, 60_000)).toBe(true);
        expect(rateLimit("t1", 3, 60_000)).toBe(false);
    });

    test("window expiry resets the count", () => {
        expect(rateLimit("t2", 1, 60_000)).toBe(true);
        expect(rateLimit("t2", 1, 60_000)).toBe(false);
        vi.advanceTimersByTime(60_001);
        expect(rateLimit("t2", 1, 60_000)).toBe(true);
    });

    test("keys are independent: one target's lockout is not another's", () => {
        expect(rateLimit("t3:alice", 1, 60_000)).toBe(true);
        expect(rateLimit("t3:alice", 1, 60_000)).toBe(false);
        expect(rateLimit("t3:bob", 1, 60_000)).toBe(true);
    });

    test("a blocked attempt does not extend the window", () => {
        expect(rateLimit("t4", 1, 60_000)).toBe(true);
        vi.advanceTimersByTime(59_000);
        expect(rateLimit("t4", 1, 60_000)).toBe(false);
        vi.advanceTimersByTime(1_001);
        expect(rateLimit("t4", 1, 60_000)).toBe(true);
    });
});