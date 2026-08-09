"use server"
import { auth } from "@/auth";
import { canManageProperty, isPropertyVendor } from "@/lib/permissions";
import pool from "@/lib/db";
import { GENESIS_HASH, makeNonce, EventPreimage, hashEvent } from "@/lib/chain";
import { revalidatePath } from "next/cache";
import { BiddingState } from "@/lib/types";
import { redirect } from "next/navigation";
import { ListingType } from "@/lib/types"; 
import { isActiveAgency } from "@/lib/permissions";

type ParsedOptionalWholeNumber = number | null | "invalid";

/**
 * Closes bidding on a property, preventing further bids
 * @param propertyId - property in question 
 * @param _previousState - unused 
 * @param formData - unused 
 * @returns an error or success message 
 */
export async function closeBidding(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();
    const userId = Number(session?.user.id);

    if (session?.user.role !== "agent") {
        return { error: "Only agents can close bidding." }
    }

    if (!(await canManageProperty(propertyId, userId))) {
        return { error: "You don't manage this property." }
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "open") {
            await client.query("ROLLBACK");
            return { error: "Bidding is not currently open" };
        }
        const tail = await client.query(
            `SELECT sequence, hash
            FROM events
            WHERE property_id = $1
            ORDER BY sequence DESC
            LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;

        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {}
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "BIDDING_CLOSED",
            actor_id: userId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);
        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, preimage.event_type, userId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE properties SET state = $1 WHERE property_id = $2`,
            ["closed", propertyId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("closeBidding transaction failed:", err)
        await client.query("ROLLBACK");
        return { error: "Something went wrong when closing bidding" }
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}

/**
 * Agent creates a new property listing 
 * @param _previousState 
 * @param formData - data input on the form used to add property details
 * @returns 
 */
export async function createListing(_previousState: unknown, formData: FormData) {

    // Session validation block
    const session = await auth();
    if (!session) {
        redirect("/login");
    }
    if (session?.user.role !== "agent") {
        return { error: "Only agents can create listing." }
    }
    const agentId = Number(session?.user.id);

    // Vendor validation block  
    const vendorEmail = formData.get("vendor_email");
    if (typeof vendorEmail !== "string" || vendorEmail === "") {
        return { error: "Enter the vendor's email address" };
    }
    const vendorResult = await pool.query<{ user_id: number }>(
        `SELECT user_id FROM users WHERE email = $1 AND role = $2`,
        [vendorEmail, "vendor"]
    );
    if (vendorResult.rowCount === null || vendorResult.rowCount < 1) {
        return { error: "No vendor found with that email: create their account first" };
    }

    // Property details validation block 
    const vendorId = vendorResult.rows[0].user_id;
    const addressLine1 = formData.get("address_line_1");
    const city = formData.get("city");
    const postcode = formData.get("postcode");
    if (typeof addressLine1 !== "string" || addressLine1 === "") {
        return { error: "Enter the first line of the address" };
    }
    if (typeof city !== "string" || city === "") {
        return { error: "Enter the city" };
    }
    if (typeof postcode !== "string" || postcode === "") {
        return { error: "Enter the postcode" };
    }


    // Property price validation block 
    const pounds = Number(formData.get("asking_price"));
    if (Number.isNaN(pounds)) {
        return { error: "Enter a valid asking price" };
    }
    if (pounds <= 0) {
        return { error: "Enter a valid asking price" };
    }
    if (!Number.isInteger(pounds)) {
        return { error: "Asking price must be whole pounds" };
    }
    const askingPricePence = pounds * 100;


    // Listing type validation block 
    const listingTypeRaw = formData.get("listing_type");
    let listingType: ListingType;
    if (listingTypeRaw === "offers_over" || listingTypeRaw === "offers_around" || listingTypeRaw === "fixed_price") {
        listingType = listingTypeRaw;
    } else {
        return { error: "Choose a listing type" };
    }


    // Optional details validation block 
    const bedrooms = parseOptionalWholeNumber(formData.get("bedrooms"));
    const bathrooms = parseOptionalWholeNumber(formData.get("bathrooms"));
    const receptions = parseOptionalWholeNumber(formData.get("receptions"));
    if (bedrooms === "invalid" || bathrooms === "invalid" || receptions === "invalid") {
        return { error: "Rooms must be whole numbers" };
    }


    // Description validation block 
    let description: string | null;
    const descriptionRaw = formData.get("description");
    if (typeof descriptionRaw === "string" && descriptionRaw !== "") {
        description = descriptionRaw;
    } else {
        description = null;
    }


    // DB transaction
    const client = await pool.connect();
    let propertyId: number;

    try {
        await client.query("BEGIN");

        const propertyInsert = await client.query<{ property_id: number }>(
            `INSERT INTO properties (vendor_id, agent_id, address_line_1, city, postcode, asking_price, bedrooms, bathrooms, receptions, description, listing_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING property_id`,
            [vendorId, agentId, addressLine1, city, postcode, askingPricePence, bedrooms, bathrooms, receptions, description, listingType]
        );

        propertyId = propertyInsert.rows[0].property_id;

        const timestamp = new Date().toISOString();
        const details = {
            asking_price_snapshot: askingPricePence,
            listing_type_snapshot: listingType,
        };
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence: 1,
            event_type: "LISTING_CREATED",
            actor_id: agentId,
            timestamp,
            details,
            nonce,
            prev_hash: GENESIS_HASH,
        };
        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, 1, "LISTING_CREATED", agentId, timestamp, details, canonicalDetails, nonce, hash, GENESIS_HASH]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("createListing transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong creating the listing" };
    } finally {
        client.release();
    }

    revalidatePath("/agent/listings");
    redirect(`/properties/${propertyId}`);
}

function parseOptionalWholeNumber(value: FormDataEntryValue | null): ParsedOptionalWholeNumber {
    if (typeof value !== "string" || value === "") {
        return null;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        return "invalid";
    }
    return parsed;
}

export async function acceptBid(propertyId: number, offerId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    if (session.user.role !== "vendor") {
        return { error: "Only the vendor can accept an offer" };
    }

    const vendorId = Number(session.user.id);

    if (!(await isPropertyVendor(propertyId, vendorId))) {
        return { error: "You are not the vendor for this property" };
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "closed") {
            await client.query("ROLLBACK");
            return { error: "Offers can only be accepted once bidding has closed" };
        }

        const offerCheck = await client.query<{ current_amount: number }>(
            `SELECT current_amount FROM offers
             WHERE offer_id = $1 AND property_id = $2 AND status = $3`,
            [offerId, propertyId, "active"]
        );

        if (offerCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "That offer is no longer available" };
        }

        const acceptedAmount = offerCheck.rows[0].current_amount;

        const tail = await client.query(
            `SELECT sequence, hash FROM events
             WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;

        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {
            offer_id: offerId,
            amount: acceptedAmount,
        };
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "BID_ACCEPTED",
            actor_id: vendorId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, "BID_ACCEPTED", vendorId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE offers SET status = $1, updated_at = NOW() WHERE offer_id = $2`,
            ["accepted", offerId]
        );

        await client.query(
            `UPDATE offers SET status = $1, updated_at = NOW()
             WHERE property_id = $2 AND status = $3 AND offer_id != $4`,
            ["expired", propertyId, "active", offerId]
        );

        await client.query(
            `UPDATE properties SET state = $1, updated_at = NOW()
             WHERE property_id = $2`,
            ["sale_agreed", propertyId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("acceptBid transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong accepting the offer" };
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}

export async function completeSale(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    if (session.user.role !== "agent") {
        return { error: "Only agents can mark a sale complete" };
    }

    const agentId = Number(session.user.id);

    if (!(await canManageProperty(propertyId, agentId))) {
        return { error: "You don't manage this property" };
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "sale_agreed") {
            await client.query("ROLLBACK");
            return { error: "Only a sale-agreed property can be completed" };
        }

        const tail = await client.query(
            `SELECT sequence, hash FROM events
            WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;

        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {};
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "SALE_COMPLETED",
            actor_id: agentId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, "SALE_COMPLETED", agentId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE properties SET state = $1, status = $2, updated_at = NOW()
             WHERE property_id = $3`,
            ["completed", "sold", propertyId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("completeSale transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong completing the sale" };
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}

/**
 * Records the collapse of an agreed sale. Appends SALE_COLLAPSED to the chain, marks the
 * accepted offer collapsed, and sets the property state to 'collapsed'.
 */
export async function collapseSale(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    const userId = Number(session.user.id);

    const reasonRaw = formData.get("reason");
    let reason: string | null;

    if (typeof reasonRaw === "string" && reasonRaw !== "") {
        reason = reasonRaw;
    } else {
        reason = null;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "sale_agreed") {
            await client.query("ROLLBACK");
            return { error: "Only an agreed sale can collapse" };
        }

        const acceptedOffer = await client.query<{ offer_id: number; current_amount: number; bidder_id: number; }>(
            `SELECT offer_id, current_amount, bidder_id FROM offers
            WHERE property_id = $1 AND status = $2`,
            [propertyId, "accepted"]
        );

        if (acceptedOffer.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "No accepted offer found on this property" };
        }

        const failedOffer = acceptedOffer.rows[0];

        let initiatedBy: "buyer" | "vendor";
        if (session.user.role === "vendor" && (await isPropertyVendor(propertyId, userId))) {
            initiatedBy = "vendor";
        } else if (session.user.role === "bidder" && failedOffer.bidder_id === userId) {
            initiatedBy = "buyer";
        } else {
            await client.query("ROLLBACK");
            return { error: "Only the vendor or the accepted bidder can withdraw from this sale" };
        }

        const tail = await client.query(
            `SELECT sequence, hash FROM events
             WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;
        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {
            failed_offer_id: failedOffer.offer_id,
            amount: failedOffer.current_amount,
            initiated_by: initiatedBy,
            reason: reason,
        };
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "SALE_COLLAPSED",
            actor_id: userId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, "SALE_COLLAPSED", userId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE offers SET status = $1, updated_at = NOW() WHERE offer_id = $2`,
            ["collapsed", failedOffer.offer_id]
        );

        await client.query(
            `UPDATE properties SET state = $1, updated_at = NOW() WHERE property_id = $2`,
            ["collapsed", propertyId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("collapseSale transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong recording the collapse" };
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}

/**
 * Relists a collapsed property
 */
export async function relistProperty(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    if (session.user.role !== "agent") {
        return { error: "Only agents can relist a property" };
    }

    const agentId = Number(session.user.id);

    if (!(await canManageProperty(propertyId, agentId))) {
        return { error: "You don't manage this property" };
    }

    const pounds = Number(formData.get("asking_price"));

    if (Number.isNaN(pounds)) {
        return { error: "Enter a valid asking price" };
    }
    if (pounds <= 0) {
        return { error: "Enter a valid asking price" };
    }
    if (!Number.isInteger(pounds)) {
        return { error: "Asking price must be whole pounds" };
    }

    const newAskingPricePence = pounds * 100;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState; asking_price: number }>(
            `SELECT state, asking_price FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        if (locked.rows[0].state !== "collapsed") {
            await client.query("ROLLBACK");
            return { error: "Only a collapsed sale can be relisted" };
        }

        const previousAskingPrice = locked.rows[0].asking_price;

        const tail = await client.query(
            `SELECT sequence, hash FROM events 
            WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;

        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {
            previous_asking_price: previousAskingPrice,
            new_asking_price: newAskingPricePence,
        };
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "PROPERTY_RELISTED",
            actor_id: agentId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, "PROPERTY_RELISTED", agentId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        await client.query(
            `UPDATE properties SET asking_price = $1, state = $2, updated_at = NOW()
             WHERE property_id = $3`,
            [newAskingPricePence, "open", propertyId]
        );

        await client.query(
            `UPDATE property_participants SET status = $1, joined_at = NULL
             WHERE property_id = $2 AND status = $3`,
            ["invited", propertyId, "joined"]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("relistProperty transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong relisting the property" };
    } finally {
        client.release();
    }

    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}

/**
 * Withdraws a listing from the market. Appends LISTING_WITHDRAWN to hash chain and sets both
 * the bidding state and the public status to 'withdrawn'.
 */
export async function withdrawListing(propertyId: number, _previousState: unknown, formData: FormData) {

    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    if (session.user.role !== "agent") {
        return { error: "Only agents can withdraw a listing" };
    }

    const agentId = Number(session.user.id);

    if (!(await isActiveAgency(agentId))) {
        return { error: "Your agency account has not been activated" };
    }

    if (!(await canManageProperty(propertyId, agentId))) {
        return { error: "You don't manage this property" };
    }

    const reasonRaw = formData.get("reason");
    let reason: string | null;
    if (typeof reasonRaw === "string" && reasonRaw !== "") {
        reason = reasonRaw;
    } else {
        reason = null;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const locked = await client.query<{ state: BiddingState }>(
            `SELECT state FROM properties WHERE property_id = $1 FOR UPDATE`,
            [propertyId]
        );

        const currentState = locked.rows[0].state;

        if (currentState !== "open" && currentState !== "closed") {
            await client.query("ROLLBACK");
            return { error: "Only an open or closed listing can be withdrawn" };
        }

        const tail = await client.query(
            `SELECT sequence, hash FROM events
            WHERE property_id = $1 ORDER BY sequence DESC LIMIT 1`,
            [propertyId]
        );

        let sequence: number;
        let prevHash: string;
        if (tail.rows.length === 0) {
            sequence = 1;
            prevHash = GENESIS_HASH;
        } else {
            sequence = tail.rows[0].sequence + 1;
            prevHash = tail.rows[0].hash;
        }

        const timestamp = new Date().toISOString();
        const details = {
            reason: reason,
        };
        const nonce = makeNonce();
        const preimage: EventPreimage = {
            property_id: propertyId,
            sequence,
            event_type: "LISTING_WITHDRAWN",
            actor_id: agentId,
            timestamp,
            details,
            nonce,
            prev_hash: prevHash,
        };

        const { hash, canonicalDetails } = hashEvent(preimage);

        await client.query(
            `INSERT INTO events (property_id, sequence, event_type, actor_id, timestamp, details, canonical_details, nonce, hash, prev_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [propertyId, sequence, "LISTING_WITHDRAWN", agentId, timestamp, details, canonicalDetails, nonce, hash, prevHash]
        );

        // Any live offers expire with the listing
        await client.query(
            `UPDATE offers SET status = $1, updated_at = NOW()
            WHERE property_id = $2 AND status = $3`,
            ["expired", propertyId, "active"]
        );

        /* Both state and status change i.e the bidding process stops and the listing also 
        leaves the market.*/ 
        await client.query(
            `UPDATE properties SET state = $1, status = $2, updated_at = NOW()
             WHERE property_id = $3`,
            ["withdrawn", "withdrawn", propertyId]
        );

        await client.query("COMMIT");

    } catch (err) {
        console.error("withdrawListing transaction failed:", err);
        await client.query("ROLLBACK");
        return { error: "Something went wrong withdrawing the listing" };
    } finally {
        client.release();
    }

    revalidatePath("/agent/listings");
    revalidatePath(`/properties/${propertyId}`);
    return { success: true };
}