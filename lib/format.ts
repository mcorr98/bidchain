import { ListingType } from "./types"; 
import { EventType } from "./chain";

/**
 * Formats prices from being represented as pence into being represented as pounds
 * @param pence - whole number, representing in pence 
 * @returns -  representing in pounds 
 */
export function formatPrice(pence: number): string {
    const pounds = pence / 100;
    if (pence % 100 === 0) {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
            maximumFractionDigits: 0,
        }).format(pounds);
    } else {

        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(pounds);
    }

}

/**
 * Takes the listing type internal representation and returns a string for frontent representation 
 * @param listingType - Listing type 
 * @returns - String plainly stating the listing type 
 */
export function listingTypeLabel(listingType: ListingType): string {
    if (listingType === "offers_over") {
        return "Offers over";
    } else if (listingType === "offers_around") {
        return "Offers around";
    } else if (listingType === "fixed_price") {
        return "Fixed price"
    }

    const unhandled: never = listingType;
    throw new Error("Unhandled listing type: " + unhandled);
}

/**
 * Formats a string with the property's headline room numbers
 * @param bedrooms - number of bedrooms in the property
 * @param bathrooms - number of bathrooms in the property
 * @param receptions - number of recpetions in the property
 * @returns - formatted string for display on property cards 
 */
export function featuresLine(bedrooms: number | null, bathrooms: number | null, receptions: number | null): string {
    const parts: string[] = [];

    if (bedrooms !== null) {
        parts.push(bedrooms + " bed");
    }
    if (bathrooms !== null) {
        parts.push(bathrooms + " bath");
    }
    if (receptions !== null) {
        parts.push(receptions + " rec");
    }

    return parts.join(" · ");
}

export function eventTypeLabel(eventType: EventType): string {
    if (eventType === "LISTING_CREATED") return "Listing created";
    else if (eventType === "BID_PLACED") return "Bid placed";
    else if (eventType === "BID_REVISED") return "Bid revised";
    else if (eventType === "BID_WITHDRAWN") return "Bid withdrawn";
    else if (eventType === "BID_RECONFIRMED") return "Bid reconfirmed";
    else if (eventType === "BID_ACCEPTED") return "Bid accepted";
    else if (eventType === "BIDDING_CLOSED") return "Bidding closed";
    else if (eventType === "BIDDING_REOPENED") return "Bidding reopened";
    else if (eventType === "LISTING_WITHDRAWN") return "Listing withdrawn";
    else if (eventType === "SALE_COLLAPSED") return "Sale collapsed";
    else if (eventType === "PROPERTY_RELISTED") return "Property relisted";
    else if (eventType === "SALE_COMPLETED") return "Sale Completed";
;

    const unhandled: never = eventType;
    throw new Error("Unhandled event type: " + unhandled);
}

export function standardiseEmail(raw: string): string {
    return raw.trim().toLowerCase();
}

export function buyerPositionLabel(position: string | null): string {
    if (position === "ftb") return "First-time buyer";
    if (position === "chain") return "In a chain";
    if (position === "no_chain") return "Nothing to sell";
    return "";
}

export function fundingLabel(funding: string | null): string {
    if (funding === "cash") return "Cash";
    if (funding === "mortgage") return "Mortgage";
    if (funding === "co_ownership") return "Co-Ownership";

    return "";
}