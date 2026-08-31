import { describe, expect, test } from "vitest";
import { matchesMagicBytes } from "./uploads_validation";

const REAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const REAL_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const REAL_WEBP = Buffer.concat([
    Buffer.from("RIFF"), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from("WEBPVP8 "),
]);
const REAL_PDF = Buffer.from("%PDF-1.7\n%some pdf");
const WINDOWS_EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00]);

describe("matchesMagicBytes", () => {
    test("accepts genuine signatures for each allowed type", () => {
        expect(matchesMagicBytes(REAL_JPEG, "image/jpeg")).toBe(true);
        expect(matchesMagicBytes(REAL_PNG, "image/png")).toBe(true);
        expect(matchesMagicBytes(REAL_WEBP, "image/webp")).toBe(true);
        expect(matchesMagicBytes(REAL_PDF, "application/pdf")).toBe(true);
    });

    test("rejects a renamed executable whatever it claims to be", () => {
        expect(matchesMagicBytes(WINDOWS_EXE, "image/jpeg")).toBe(false);
        expect(matchesMagicBytes(WINDOWS_EXE, "image/png")).toBe(false);
        expect(matchesMagicBytes(WINDOWS_EXE, "application/pdf")).toBe(false);
    });

    test("rejects a type claim that mismatches real bytes", () => {
        expect(matchesMagicBytes(REAL_PNG, "image/jpeg")).toBe(false);
        expect(matchesMagicBytes(REAL_JPEG, "application/pdf")).toBe(false);
    });

    test("rejects types outside the allowlist even with plausible bytes", () => {
        expect(matchesMagicBytes(REAL_JPEG, "image/svg+xml")).toBe(false);
        expect(matchesMagicBytes(REAL_JPEG, "")).toBe(false);
    });

    test("rejects empty and truncated buffers", () => {
        expect(matchesMagicBytes(Buffer.alloc(0), "image/jpeg")).toBe(false);
        expect(matchesMagicBytes(Buffer.from([0xff]), "image/jpeg")).toBe(false);
    });
});