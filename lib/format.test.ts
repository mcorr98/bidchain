import { describe, it, expect } from "vitest";
import { formatPrice, listingTypeLabel, featuresLine } from "./format";

describe("formatPrice", () => {
    it("formats whole pounds without decimals", () => {
        expect(formatPrice(24500000)).toBe("£245,000");
    });

    it("shows pennies when the amount is not a whole number of pounds", () => {
        expect(formatPrice(24500050)).toBe("£245,000.50");
    });

    it("adds thousands separators", () => {
        expect(formatPrice(100000000)).toBe("£1,000,000");
    });

    it("formats zero", () => {
        expect(formatPrice(0)).toBe("£0");
    });
});

describe("listingTypeLabel", () => {
    it("labels offers over", () => {
        expect(listingTypeLabel("offers_over")).toBe("Offers over");
    });

    it("labels offers around", () => {
        expect(listingTypeLabel("offers_around")).toBe("Offers around");
    });

    it("labels fixed price", () => {
        expect(listingTypeLabel("fixed_price")).toBe("Fixed price");
    });
});

describe("featuresLine", () => {
    it("joins all three room counts", () => {
        expect(featuresLine(4, 2, 2)).toBe("4 bed · 2 bath · 2 rec");
    });

    it("omits missing values", () => {
        expect(featuresLine(3, null, null)).toBe("3 bed");
    });

    it("separates only the values present", () => {
        expect(featuresLine(3, null, 1)).toBe("3 bed · 1 rec");
    });

    it("returns an empty string when nothing is known", () => {
        expect(featuresLine(null, null, null)).toBe("");
    });
});
