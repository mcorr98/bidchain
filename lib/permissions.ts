import pool from "./db";

/**
* Checks whether a user is a joined participant on a property  
* @param propertyId - the property in question 
* @param userId - the user whose participation is being verified
* @returns - true if the bidder has joined the the property as a participant, false otherwise 
*/
export async function canBidOn(propertyId: number, userId: number): Promise<boolean> {

    const result = await pool.query(
        `SELECT participant_id FROM property_participants
         WHERE property_id = $1 AND user_id = $2 AND status = $3`,
        [propertyId, userId, "joined"]
    );
    return result.rowCount !== null && result.rowCount > 0;

}