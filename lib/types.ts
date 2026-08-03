/**
 * Property Status type: the property's publicly listed lifecycle stage  
 * property.status in schema 
 */

export type PropertyStatus = "active" | "sale_agreed" | "withdrawn" | "sold" | "relisted";   

/**
 * Stage of the bidding process
 * property.state in the schema 
 */
export type BiddingState = "open" | "closed"| "sale_agreed"| "collapsed"| "withdrawn" | "completed"; 

/**
 * Types of offers the vendor indicates they're fielding on the listing 
 */
export type ListingType = "offers_over" | "offers_around" | "fixed_price"; 

/**
 * Property type: contract for all the property attributes 
 */
export type Property = {
    property_id: number,
    vendor_id: number,
    agent_id: number,
    address_line_1: string,
    address_line_2: string | null,
    city: string,
    postcode: string,
    asking_price: number,
    bedrooms: number | null,
    bathrooms: number | null,
    receptions: number | null,
    description: string | null,
    image_path: string | null,
    listing_url: string | null,
    listing_type: ListingType,
    status: PropertyStatus,
    state: BiddingState,
    created_at: Date,
    updated_at: Date
}