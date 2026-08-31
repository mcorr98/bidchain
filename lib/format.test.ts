import { describe, it, expect } from "vitest";
import { formatPrice, listingTypeLabel, featuresLine, fundingLabel, buyerPositionLabel, standardiseEmail, eventTypeLabel } from "./format";

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

describe("formatPrice fractional branch", () => {
    it("shows pence when the amount is not whole pounds", () => {
        expect(formatPrice(249950050)).toBe("£2,499,500.50");
    });


    describe("eventTypeLabel", () => {
        it("labels every event type in the vocabulary", () => {
            expect(eventTypeLabel("LISTING_CREATED")).toBe("Listing created");
            expect(eventTypeLabel("BID_PLACED")).toBe("Bid placed");
            expect(eventTypeLabel("BID_REVISED")).toBe("Bid revised");
            expect(eventTypeLabel("BID_WITHDRAWN")).toBe("Bid withdrawn");
            expect(eventTypeLabel("BID_RECONFIRMED")).toBe("Bid reconfirmed");
            expect(eventTypeLabel("BID_ACCEPTED")).toBe("Bid accepted");
            expect(eventTypeLabel("BIDDING_CLOSED")).toBe("Bidding closed");
            expect(eventTypeLabel("BIDDING_REOPENED")).toBe("Bidding reopened");
            expect(eventTypeLabel("LISTING_WITHDRAWN")).toBe("Listing withdrawn");
            expect(eventTypeLabel("SALE_COLLAPSED")).toBe("Sale collapsed");
            expect(eventTypeLabel("PROPERTY_RELISTED")).toBe("Property relisted");
            expect(eventTypeLabel("SALE_COMPLETED")).toBe("Sale Completed");
        });
    });

    describe("standardiseEmail", () => {
        it("lowercases and trims", () => {
            expect(standardiseEmail("  Dan.Boyd@Example.COM ")).toBe("dan.boyd@example.com");
        });
        it("leaves an already-normal email untouched", () => {
            expect(standardiseEmail("sean@bidchain.test")).toBe("sean@bidchain.test");
        });
    });

    describe("buyerPositionLabel and fundingLabel", () => {
        it("labels the position vocabulary and blanks the unknown", () => {
            expect(buyerPositionLabel("ftb")).toBe("First-time buyer");
            expect(buyerPositionLabel("chain")).toBe("In a chain");
            expect(buyerPositionLabel("no_chain")).toBe("Nothing to sell");
            expect(buyerPositionLabel(null)).toBe("");
        });
        it("labels the funding vocabulary and blanks the unknown", () => {
            expect(fundingLabel("cash")).toBe("Cash");
            expect(fundingLabel("mortgage")).toBe("Mortgage");
            expect(fundingLabel("co_ownership")).toBe("Co-Ownership");
            expect(fundingLabel(null)).toBe("");
        });
    });
});