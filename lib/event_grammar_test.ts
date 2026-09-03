import { describe, expect, test } from "vitest";
import { ChainState, EventType, isEventLegal, nextChainState } from "./chain";

function walk(events: EventType[]): ChainState {
    let state: ChainState = "unlisted";
    for (const eventType of events) {
        expect(isEventLegal(eventType, state)).toBe(true);
        state = nextChainState(eventType, state);
    }
    return state;
}

describe("event grammar", () => {
    test("the full happy path is legal end to end", () => {
        const finalState = walk([
            "LISTING_CREATED", "BID_PLACED", "BID_REVISED", "BIDDING_CLOSED",
            "BID_ACCEPTED", "SALE_COMPLETED",
        ]);
        expect(finalState).toBe("completed");
    });

    test("collapse, relist, and re-bid is legal", () => {
        const finalState = walk([
            "LISTING_CREATED", "BID_PLACED", "BIDDING_CLOSED", "BID_ACCEPTED",
            "SALE_COLLAPSED", "PROPERTY_RELISTED", "BID_PLACED",
        ]);
        expect(finalState).toBe("open");
    });

    test("withdrawal is legal while closed but bidding is not", () => {
        expect(isEventLegal("BID_WITHDRAWN", "closed")).toBe(true);
        expect(isEventLegal("BID_PLACED", "closed")).toBe(false);
        expect(isEventLegal("BID_REVISED", "closed")).toBe(false);
    });

    test("nothing precedes genesis and nothing follows the terminals", () => {
        expect(isEventLegal("BID_PLACED", "unlisted")).toBe(false);
        expect(isEventLegal("LISTING_CREATED", "open")).toBe(false);
        expect(isEventLegal("BID_PLACED", "completed")).toBe(false);
        expect(isEventLegal("PROPERTY_RELISTED", "withdrawn")).toBe(false);
    });

    test("acceptance requires closed bidding", () => {
        expect(isEventLegal("BID_ACCEPTED", "open")).toBe(false);
        expect(isEventLegal("BID_ACCEPTED", "closed")).toBe(true);
    });
});