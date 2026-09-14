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
