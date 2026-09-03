import { beforeEach, describe, expect, test, vi } from "vitest";

describe("sendBidReceiptEmail", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("returns false instead of throwing when the mail server is unreachable", async () => {
        vi.stubEnv("SMTP_HOST", "localhost");
        vi.stubEnv("SMTP_PORT", "9"); // discard port - nothing listens here
        const { sendBidReceiptEmail } = await import("./email");

        const result = await sendBidReceiptEmail(
            "bidder@bidchain.test",
            "1 Test Street, Belfast",
            "{}",
            "receipt.json"
        );
        expect(result).toBe(false);
    });
});