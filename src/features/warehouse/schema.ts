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
});

export const addPackageItemsSchema = z
  .object({
    order_ids: z.array(z.uuid()).max(100).optional(),
    lines: z.array(customLine).max(50).optional(),
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
});

export const packageActionSchema = z.object({
  action: z.enum(["seal", "reopen", "ship", "label_printed"]),
  carrier: optionalText(80),
  tracking_number: optionalText(80),
});

export const lookupSchema = z.object({
  code: z.string().trim().min(1, "Scan or type a code").max(300),
});

export type UpdatePackageInput = z.infer<typeof packageDetailsSchema>;
export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type AddPackageItemsInput = z.infer<typeof addPackageItemsSchema>;
export type ReceiveItemInput = z.infer<typeof receiveItemSchema>;
export type ShipPackageInput = z.infer<typeof shipPackageSchema>;
