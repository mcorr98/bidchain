import { ListingType } from "./types"; 

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