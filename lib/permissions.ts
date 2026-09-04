import pool from "./db";
import { QueryResult } from "pg";

type IdDocumentViewer = {
    id: string;
    role: string;
};

/**
 * Helper method which checks whether a query returns any rows 
 * @param result - result of the query to be checked for rows 
 * @returns true if query result has rows, false if not 
 */
function hasRows(result: QueryResult): boolean {
    return result.rowCount !== null && result.rowCount > 0;
}

/**
* Checks whether a user is a joined participant on a property for bidding
* @param propertyId - the property in question 
* @param userId - the user whose participation is being verified
* @returns - true if the bidder has joined the property as a participant, false otherwise 
*/
export async function canBidOn(propertyId: number, userId: number): Promise<boolean> {

    const result = await pool.query(
        `SELECT participant_id FROM property_participants
        WHERE property_id = $1 AND user_id = $2 AND status = $3`,
        [propertyId, userId, "joined"]
    );
    if (!hasRows(result)) {
        return false;
    }

    const isVerified = await isVerifiedForProperty(propertyId, userId);
    return isVerified;

}

/**
 * Checks whether a user is a joined participant or agent for a property to view the event chain
 * @param propertyId - the property in question 
 * @param userId - the user whose participation is being verified
 * @returns - true if the bidder has joined the property as a participant, or the agent is managing this property. False otherwise.
 */
export async function canViewOffers(propertyId: number, userId: number): Promise<boolean> {

    const bidderResult = await pool.query(
        `SELECT participant_id FROM property_participants
         WHERE property_id = $1 AND user_id = $2 AND status = $3`,
        [propertyId, userId, "joined"]
    );

    const isAssignedAgent = await canManageProperty(propertyId, userId);
    const isVendor = await isPropertyVendor(propertyId, userId);

    return hasRows(bidderResult) || isAssignedAgent || isVendor;
}

/**
 * Checks whether the user is the agent managing the property 
 * @param propertyId - property in question 
 * @param userId - user who's being checked as the agent for the property 
 * @returns - true if agent is the property manager, false if not 
 */
export async function canManageProperty(propertyId: number, userId: number): Promise<boolean> {

    const agentResult = await pool.query(
        `SELECT property_id FROM properties 
        WHERE property_id = $1 AND agent_id = $2`,
        [propertyId, userId]
    );

    return hasRows(agentResult);
}

/**
 * Checks whether the user is the vendor selling the property 
 * @param propertyId - property in question
 * @param userId - user details to check as the vendor  
 * @returns true if the vendor is the seller of the property, false if not
 */
export async function isPropertyVendor(propertyId: number, userId: number): Promise<boolean> {
    const result = await pool.query(
        `SELECT property_id FROM properties 
        WHERE property_id = $1 AND vendor_id = $2`,
        [propertyId, userId]
    );

    return hasRows(result);
}

/**
 * Checks whether a user may view a bidder's identity document
 * @param viewer - the session user requesting the document
 * @param ownerUserId - the bidder the document belongs to
 * @returns true if the viewer may see the document, false otherwise
 */
export async function canViewIdDocument(viewer: IdDocumentViewer, ownerUserId: number): Promise<boolean> {
    if (viewer.role === "admin") {
        return true;
    }
    if (Number(viewer.id) === ownerUserId) {
        return true;
    }
    if (viewer.role === "agent") {
        const result = await pool.query(
            `SELECT pp.participant_id
            FROM property_participants pp
            JOIN properties p ON p.property_id = pp.property_id
            WHERE p.agent_id = $1 AND pp.user_id = $2`,
            [Number(viewer.id), ownerUserId]
        );
        return hasRows(result);
    }
    return false;
}

/**
 * Checks whether a bidder holds a verified attestation from the agency
 * managing this property
 * @param propertyId - the property in question
 * @param bidderId - the bidder whose verification is being checked
 * @returns true if this property's agency has verified the bidder, false otherwise
 */
export async function isVerifiedForProperty(propertyId: number, bidderId: number): Promise<boolean> {
    const result = await pool.query(
        `SELECT bv.verification_id
        FROM bidder_verifications bv
        JOIN properties p ON p.agent_id = bv.agency_id
        WHERE p.property_id = $1
        AND bv.bidder_id = $2
        AND bv.status = 'verified'`,
        [propertyId, bidderId]
    );
    return hasRows(result);
}

/**
 * Checks whether an agent's agency account has been admin-activated.
 * @param agentId - the agent user being checked
 * @returns true if the agency is active, false otherwise
 */
export async function isActiveAgency(agentId: number): Promise<boolean> {
    const result = await pool.query(
        `SELECT agent_profile_id FROM agent_profiles
        WHERE user_id = $1 AND activation_status = 'active'`,
        [agentId]
    );
    return hasRows(result);
}

/**
 * Checks whether a user has a bidder profile.
 * @param userId - the user being checked
 * @returns true if a bidder profile exists for this user, otherwise false
 */
export async function hasBidderProfile(userId: number): Promise<boolean> {
    const result = await pool.query(
        `SELECT bidder_profile_id FROM bidder_profiles WHERE user_id = $1`,
        [userId]
    );
    return hasRows(result);
}

/**
 * Checks whether a user has a vendor profile.
 * @param userId - the user being checked
 * @returns true if a vendor profile exists for this user, otherwise false
 */
export async function hasVendorProfile(userId: number): Promise<boolean> {
    const result = await pool.query(
        `SELECT vendor_profile_id FROM vendor_profiles WHERE user_id = $1`,
        [userId]
    );
    return hasRows(result);
}