import pool from "./db";
import { QueryResult } from "pg";

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
 * Checks whether a user is a joined participant or agent for a property to view the event chain (TODO: Vendor)
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

    const agentResult = await pool.query(
        `SELECT property_id FROM properties 
        WHERE property_id = $1 AND agent_id = $2`,
        [propertyId, userId]
    );

    return hasRows(bidderResult) || hasRows(agentResult);
} 