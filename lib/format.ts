export type ListingType = "offers_over" | "offers_around" | "fixed_price";

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