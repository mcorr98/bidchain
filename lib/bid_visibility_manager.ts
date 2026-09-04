type ParticipantLabelOptions = {
    isManaging: boolean;
    isVendorViewer: boolean;
    viewerId: number;
    agentId: number;
    vendorId: number | null;
    aliases: Map<number, string>;
};

/**
 * Display-name alias policy.
 * The property's estate agent has visibility of names.
 * The agency acts openly under its own name.
 * The vendor simply appears as "Vendor" to bidders.
 * Bidders appear as chain-derived aliases.
 * Viewers see themselves.
 */
export function makeParticipantLabel(options: ParticipantLabelOptions): (actorId: number, actorName: string) => string {
    return function participantLabel(actorId: number, actorName: string): string {
        if (options.isManaging) {
            return actorName;
        }
        if (actorId === options.agentId) {
            return actorName;
        }
        if (options.vendorId !== null && actorId === options.vendorId) {
            if (options.isVendorViewer) {
                return actorName + " (you)";
            }
            return "Vendor";
        }
        const alias = options.aliases.get(actorId) ?? "Bidder";
        if (actorId === options.viewerId) {
            return alias + " (you)";
        }
        return alias;
    };
}

/**
 * Aliases: derived from the chain and assigned by order of first bid.
 * They inherit the record's immutability so they never lose their order.
 */
export function buildBidderAliases(bidActorIdsInSequenceOrder: number[]): Map<number, string> {
    const aliases = new Map<number, string>();
    for (const actorId of bidActorIdsInSequenceOrder) {
        if (!aliases.has(actorId)) {
            aliases.set(actorId, "Bidder " + String.fromCharCode(65 + aliases.size));
        }
    }
    return aliases;
}