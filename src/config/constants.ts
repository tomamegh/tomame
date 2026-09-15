export const ROLES = {
  USER: "user",
  ADMIN: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const AUDIT_ENTITY_TYPES = {
  USER: "user",
  PAYMENT: "payment",
  ORDER: "order",
  JOB: "job",
  STORE: "store",
  PRICE_WATCH: "price_watch",
  QUOTE_LOCK: "quote_lock",
  DELIVERY_ADDRESS: "delivery_address",
  ORDER_GROUP: "order_group",
  ASSISTED_REQUEST: "assisted_request",
  CONTACT_MESSAGE: "contact_message",
  /**
   * The admin-owned content layer (036–040) and the bag's physical objects
   * (048).
   *
   * These were missing, and the absence had consequences rather than being
   * untidy: a site-settings or delivery-zone edit had to be audited as `store`
   * with the real table hidden in `metadata`, so an audit log could not answer
   * "who changed the delivery fee" without reading every `store` row; and the
   * admin's box and bag screens were left READ-ONLY, because CLAUDE.md does not
   * permit a state change without an audit row and there was no type to write.
   *
   * `entity_id` is a UUID column, so a row keyed by TEXT (`site_settings.key`,
   * `regions.code`) still carries its key in `metadata` — the type says WHAT was
   * changed, which is the half that was missing.
   */
  SITE_SETTING: "site_setting",
  SITE_CONTENT: "site_content",
  REGION: "region",
  DELIVERY_ZONE: "delivery_zone",
  POLICY: "policy",
  CONSOLIDATION_BOX: "consolidation_box",
  CART: "cart",
  /**
   * 054. A parcel photograph is a picture of one named customer's property, and
   * a hold stops their shipment — both are state changes on someone's order and
   * neither is auditable as `order` without losing which of the two happened.
   */
  ORDER_PHOTO: "order_photo",
  ORDER_FEEDBACK: "order_feedback",
  ORDER_HOLD: "order_hold",
  /**
   * 067, the cars en route to Ghana.
   *
   * Three types rather than one `car`, because the three things an
   * investigation asks about are genuinely different events. A listing change
   * is an admin altering a five-figure advertised price or taking a car off
   * the site. A photo change is evidence of what a vehicle looked like before
   * it sailed, and deleting one destroys that. An enquiry change is somebody
   * answering — or accepting — a named customer's offer. Auditing all three as
   * `car` would hide which happened behind `metadata->>'table'`, which is the
   * exact mistake the SITE_SETTING block above was added to undo.
   *
   * All three tables are keyed by UUID, so `entity_id` takes the id directly
   * and the slug rides in `metadata` for the queries that read by name.
   */
  CAR_LISTING: "car_listing",
  CAR_PHOTO: "car_photo",
  CAR_ENQUIRY: "car_enquiry",
} as const;

export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];

export const AUDIT_ACTOR_ROLES = {
  USER: "user",
  ADMIN: "admin",
  SYSTEM: "system",
} as const;

export type AuditActorRole =
  (typeof AUDIT_ACTOR_ROLES)[keyof typeof AUDIT_ACTOR_ROLES];

export const ORDER_STATUSES = {
  PENDING: "pending",
  PAID: "paid",
  PROCESSING: "processing",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

export const PAYMENT_STATUSES = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const ORIGIN_COUNTRIES = {
  USA: "USA",
  UK: "UK",
  CHINA: "CHINA",
} as const;

export type OriginCountry =
  (typeof ORIGIN_COUNTRIES)[keyof typeof ORIGIN_COUNTRIES];

// ── Cars en route to Ghana (migration 067) ──────────────────────────────────
//
// No Postgres enums exist in this codebase: every status is a TEXT column with
// a CHECK, mirrored here by a `const … as const` and a union type. These blocks
// ARE that mirror for `car_listings` and `car_enquiries`, and each one must be
// kept in step with the CHECK it names — a value that exists here and not in
// the database fails at INSERT time, halfway through a write.

/**
 * Where a car is shipped from.
 *
 * DELIBERATELY NOT `ORIGIN_COUNTRIES`. That constant is the three
 * parcel-forwarding regions (`orders.origin_country` CHECKs the same three),
 * and a value there selects a pricing group and a hub address. A car's origin
 * does none of that — it is descriptive text on a listing, and it is how a
 * customer knows whether they are looking at a right-hand-drive import. The
 * cars come overwhelmingly from Japan, Korea and Germany, none of which Tomame
 * forwards parcels from, so reusing the parcel list would have meant either a
 * wrong value on every Japanese vehicle or widening a CHECK that `orders`
 * depends on. Migration 067 says the same thing from the database side.
 */
export const CAR_ORIGIN_COUNTRIES = {
  USA: "USA",
  CANADA: "CANADA",
  UK: "UK",
  GERMANY: "GERMANY",
  JAPAN: "JAPAN",
  KOREA: "KOREA",
  UAE: "UAE",
  CHINA: "CHINA",
} as const;

export type CarOriginCountry =
  (typeof CAR_ORIGIN_COUNTRIES)[keyof typeof CAR_ORIGIN_COUNTRIES];

/**
 * What kind of price a listing carries — the heart of the feature.
 *
 * FIXED is a number the customer can act on. NEGOTIABLE is an asking price that
 * invites an offer. ON_REQUEST has no number at all, on purpose, so that a
 * buyer speaks to the customer before quoting.
 *
 * The combinations that are NOT states are as important as the ones that are:
 * `car_listings_price_state_has_price` makes "on request but priced" and
 * "fixed with no price" unrepresentable in the database, so no read path has to
 * defend against a listing that says one thing and carries another.
 */
export const CAR_PRICE_STATES = {
  FIXED: "fixed",
  NEGOTIABLE: "negotiable",
  ON_REQUEST: "on_request",
} as const;

export type CarPriceState =
  (typeof CAR_PRICE_STATES)[keyof typeof CAR_PRICE_STATES];

/** The unit the odometer reading was taken in. Never converted for display. */
export const CAR_MILEAGE_UNITS = { MI: "mi", KM: "km" } as const;

export type CarMileageUnit =
  (typeof CAR_MILEAGE_UNITS)[keyof typeof CAR_MILEAGE_UNITS];

export const CAR_FUEL_TYPES = {
  PETROL: "petrol",
  DIESEL: "diesel",
  HYBRID: "hybrid",
  PLUG_IN_HYBRID: "plug_in_hybrid",
  ELECTRIC: "electric",
  OTHER: "other",
} as const;

export type CarFuelType = (typeof CAR_FUEL_TYPES)[keyof typeof CAR_FUEL_TYPES];

export const CAR_TRANSMISSIONS = {
  AUTOMATIC: "automatic",
  MANUAL: "manual",
  CVT: "cvt",
  OTHER: "other",
} as const;

export type CarTransmission =
  (typeof CAR_TRANSMISSIONS)[keyof typeof CAR_TRANSMISSIONS];

export const CAR_DRIVETRAINS = {
  FWD: "fwd",
  RWD: "rwd",
  AWD: "awd",
  FOUR_WD: "4wd",
} as const;

export type CarDrivetrain =
  (typeof CAR_DRIVETRAINS)[keyof typeof CAR_DRIVETRAINS];

export const CAR_BODY_TYPES = {
  SEDAN: "sedan",
  SUV: "suv",
  HATCHBACK: "hatchback",
  PICKUP: "pickup",
  VAN: "van",
  COUPE: "coupe",
  WAGON: "wagon",
  CONVERTIBLE: "convertible",
  BUS: "bus",
  TRUCK: "truck",
  OTHER: "other",
} as const;

export type CarBodyType = (typeof CAR_BODY_TYPES)[keyof typeof CAR_BODY_TYPES];

/**
 * What a customer is asking for.
 *
 * PRICE_REQUEST belongs to an `on_request` listing and carries no amount;
 * OFFER belongs to a `negotiable` one and must carry one. The database enforces
 * the amount rule (`car_enquiries_kind_amount`); the service enforces the
 * listing rule, which a CHECK cannot see because it lives on another row.
 */
export const CAR_ENQUIRY_KINDS = {
  PRICE_REQUEST: "price_request",
  OFFER: "offer",
} as const;

export type CarEnquiryKind =
  (typeof CAR_ENQUIRY_KINDS)[keyof typeof CAR_ENQUIRY_KINDS];

/**
 * The enquiry queue's states.
 *
 * ACCEPTED MEANS A HUMAN SAID YES, AND NOTHING MORE. It creates no order, takes
 * no money and starts no state machine — buying a car is a later phase pending
 * a product decision. Anyone adding a purchase path should read migration 067's
 * header before assuming this status is the hand-off point.
 */
export const CAR_ENQUIRY_STATUSES = {
  OPEN: "open",
  ANSWERED: "answered",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  WITHDRAWN: "withdrawn",
} as const;

export type CarEnquiryStatus =
  (typeof CAR_ENQUIRY_STATUSES)[keyof typeof CAR_ENQUIRY_STATUSES];
