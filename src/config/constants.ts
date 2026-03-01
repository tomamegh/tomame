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

