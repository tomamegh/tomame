/**
 * The two-stage delivery promise (site brief Fix 6). Until the store's tracking
 * is in, a customer sees only the usual range. Once it is, the item's Delta
 * Cargo flight (the first Wednesday or Friday departure whose cutoff is after
 * it reaches the hub) and the door date follow from these.
 */

/** Days from the store's tracking being registered to the parcel reaching our US hub, until it actually arrives. */
export const HUB_TRANSIT_DAYS = 3;
/** Days from a Delta Cargo departure (JFK) to the customer's door in Accra: the flight, clearance, delivery. */
export const ACCRA_DAYS_AFTER_FLIGHT = 3;
/** The range shown before any store tracking exists. */
export const USUAL_DELIVERY_RANGE = "usually 5–7 days";
