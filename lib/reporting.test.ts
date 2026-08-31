import { afterAll, describe, expect, test } from "vitest";
import pool from "./db";
import { getReportMetrics, parseDateParam } from "./reporting";

afterAll(async () => {
    await pool.end();
});

describe("getReportMetrics on an empty period", () => {
    test("every metric degrades to null or empty, never throws", async () => {
        const metrics = await getReportMetrics(999999, "2001-01-01T00:00:00.000Z", "2001-01-02T00:00:00.000Z");
        expect(metrics.averageDaysToAgreed).toBeNull();
        expect(metrics.averageDaysToFirstBid).toBeNull();
        expect(metrics.averageRatio).toBeNull();
        expect(metrics.acceptances).toBe(0);
        expect(metrics.collapses).toBe(0);
        expect(metrics.collapseReasons).toEqual([]);
        expect(metrics.listingsByMonth).toEqual([]);
        expect(metrics.averageDaysLostToCollapse).toBeNull();
        expect(metrics.averageRelistDiscount).toBeNull();
    });
});

describe("parseDateParam", () => {
    test("valid dates parse, garbage falls back", () => {
        const fallback = new Date("2026-01-01");
        expect(parseDateParam("2026-08-27", fallback).toISOString().slice(0, 10)).toBe("2026-08-27");
        expect(parseDateParam("not-a-date", fallback)).toBe(fallback);
        expect(parseDateParam(undefined, fallback)).toBe(fallback);
    });
});