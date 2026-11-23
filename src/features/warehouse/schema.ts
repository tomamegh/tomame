import { z } from "zod";

/** Request bodies for `/api/warehouse/*` (081). Shared by the routes and the forms. */

const positive = (max: number) =>
  z.coerce.number().positive("Must be more than zero").max(max, `Must be ${max} or less`);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const packageDetailsSchema = z.object({
  service: z.enum(["air", "sea"]).optional(),
  origin: z.string().trim().max(80).optional(),
  destination: z.string().trim().max(80).optional(),
  weight_lbs: positive(2000).nullable().optional(),
  length_in: positive(200).nullable().optional(),
  width_in: positive(200).nullable().optional(),
  height_in: positive(200).nullable().optional(),
  carrier: optionalText(80),
  tracking_number: optionalText(80),
  fragile: z.boolean().optional(),
  this_way_up: z.boolean().optional(),
  keep_dry: z.boolean().optional(),
  notes: optionalText(1000),
});

const customLine = z.object({
  description: z.string().trim().min(1, "Describe the item").max(200),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
});

export const createPackageSchema = packageDetailsSchema.extend({
  order_ids: z.array(z.uuid()).max(100).optional(),
  lines: z.array(customLine).max(50).optional(),
  /** 114: pack past the box capacity, or an oversize item with others. */
  capacity_override_reason: optionalText(500),
});

export const addPackageItemsSchema = z
  .object({
    order_ids: z.array(z.uuid()).max(100).optional(),
    lines: z.array(customLine).max(50).optional(),
    /** 114: pack past the box capacity, or an oversize item with others. */
    capacity_override_reason: optionalText(500),
  })
  .refine((v) => (v.order_ids?.length ?? 0) + (v.lines?.length ?? 0) > 0, {
    message: "Choose at least one item",
  });

export const receiveItemSchema = z.object({
  weight_lbs: positive(2000).nullable().optional(),
  location: optionalText(80),
  note: optionalText(300),
});

export const shipPackageSchema = z.object({
  carrier: optionalText(80),
  tracking_number: optionalText(80),
  /** 113: why it ships without a Delta Cargo air waybill. */
  no_tracking_reason: optionalText(500),
});

export const packageActionSchema = z.object({
  action: z.enum(["seal", "reopen", "ship", "label_printed", "hold", "release", "void"]),
  carrier: optionalText(80),
  tracking_number: optionalText(80),
  /** 112: seal although an order in it is already delivered or closed. */
  override_reason: optionalText(500),
  /** 114: seal on the estimated weight, without a scale reading. */
  weight_estimate_reason: optionalText(500),
  /** 114: seal past the box capacity. */
  capacity_override_reason: optionalText(500),
  /** 112: why a sealed package is held. */
  hold_reason: optionalText(500),
  /** 112: a manager resolving a package that can never ship. */
  void_reason: z.enum(["record_error", "duplicate"]).optional(),
  note: optionalText(1000),
  /** 113: shipping without an air waybill needs a reason. */
  no_tracking_reason: optionalText(500),
});

export const lookupSchema = z.object({
  code: z.string().trim().min(1, "Scan or type a code").max(300),
});

// ── Inbound parcels (086) ───────────────────────────────────────────────────

const trackingText = z
  .string()
  .trim()
  .min(6, "That is too short to be a tracking number")
  .max(120, "That is too long to be a tracking number");

/** Register a store's tracking number against an order, before or after it lands. */
export const registerInboundSchema = z.object({
  order_id: z.uuid(),
  tracking_number: trackingText,
  store_order_ref: optionalText(80),
  note: optionalText(300),
});

export const linkInboundSchema = z.object({ order_id: z.uuid() });

/** Correct an expected parcel's tracking number. */
export const correctInboundTrackingSchema = z.object({ tracking_number: trackingText });

/** A parcel that arrived and nobody expected. */
export const unmatchedInboundSchema = z.object({
  tracking_number: trackingText,
  note: optionalText(300),
});

export type RegisterInboundInput = z.infer<typeof registerInboundSchema>;
export type UnmatchedInboundInput = z.infer<typeof unmatchedInboundSchema>;
export type UpdatePackageInput = z.infer<typeof packageDetailsSchema>;
export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type AddPackageItemsInput = z.infer<typeof addPackageItemsSchema>;
export type ReceiveItemInput = z.infer<typeof receiveItemSchema>;
export type ShipPackageInput = z.infer<typeof shipPackageSchema>;

/** 098: several parcels off the truck at once, no weights. */
export const bulkReceiveSchema = z.object({
  order_ids: z.array(z.uuid()).min(1, "Choose at least one item").max(100),
});

/** Store tracking added to orders after they were bought: one or many orders, one or many numbers (or links). */
export const addOrdersTrackingSchema = z.object({
  order_ids: z.array(z.uuid()).min(1, "Pick at least one order").max(50, "Fifty orders at most at once"),
  tracking_numbers: z
    .array(z.string().trim().min(1).max(500))
    .min(1, "Enter a tracking number or link")
    .max(5, "Five tracking numbers at most at once"),
  store_order_ref: z.string().trim().max(80).optional(),
  share_store_tracking: z.boolean().optional(),
});
export type AddOrdersTrackingInput = z.infer<typeof addOrdersTrackingSchema>;
