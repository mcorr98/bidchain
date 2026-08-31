import { describe, expect, test } from "vitest";
import { buildBidderAliases, makeParticipantLabel } from "./bid_visibility_manager";

describe("buildBidderAliases", () => {
    test("assigns letters in order of first activity", () => {
        const aliases = buildBidderAliases([7, 3, 7, 9]);
        expect(aliases.get(7)).toBe("Bidder A");
        expect(aliases.get(3)).toBe("Bidder B");
        expect(aliases.get(9)).toBe("Bidder C");
    });

    test("repeat activity never reorders aliases", () => {
        const aliases = buildBidderAliases([7, 3, 3, 3, 7, 9, 3]);
        expect(aliases.get(3)).toBe("Bidder B");
    });

    test("empty chain yields no aliases", () => {
        expect(buildBidderAliases([]).size).toBe(0);
    });
});

describe("makeParticipantLabel", () => {
    const aliases = buildBidderAliases([7, 3]);

    test("agent viewer sees real names", () => {
        const label = makeParticipantLabel({
            isManaging: true, isVendorViewer: false, viewerId: 1,
            agentId: 1, vendorId: 2, aliases: aliases,
        });
        expect(label(7, "Dan Boyd")).toBe("Dan Boyd");
    });

    test("bidder viewer sees vendor as Vendor and rivals as aliases", () => {
        const label = makeParticipantLabel({
            isManaging: false, isVendorViewer: false, viewerId: 7,
            agentId: 1, vendorId: 2, aliases: aliases,
        });
        expect(label(2, "Sean Murphy")).toBe("Vendor");
        expect(label(3, "Niamh Kelly")).toBe("Bidder B");
        expect(label(7, "Dan Boyd")).toBe("Bidder A (you)");
    });

    test("agent is always named: the agency acts openly", () => {
        const label = makeParticipantLabel({
            isManaging: false, isVendorViewer: false, viewerId: 7,
            agentId: 1, vendorId: 2, aliases: aliases,
        });
        expect(label(1, "Aoife Magee")).toBe("Aoife Magee");
    });

    test("unknown actor falls back to plain Bidder", () => {
        const label = makeParticipantLabel({
            isManaging: false, isVendorViewer: false, viewerId: 7,
            agentId: 1, vendorId: null, aliases: aliases,
        });
        expect(label(99, "Mystery")).toBe("Bidder");
    });
});