import pool from "./db";
import { QueryResult } from "pg";

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
    return hasRows(result);

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
 * @returns true is vendor is the seller of the property, false if not 
 */
export async function isPropertyVendor(propertyId: number, userId: number): Promise<boolean> { 
    const vendorResult = await pool.query(
        `SELECT property_id FROM properties 
        WHERE property_id = $1 AND vendor_id = $2`,
        [propertyId, userId]
    );

    return hasRows(vendorResult);
}
