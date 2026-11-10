import { z } from "zod";

import { courierHandoffSchema } from "@/features/order-delivery/schema";
import { normaliseWhatsAppPhone } from "@/lib/whatsapp/phone";

import { MOVABLE_STAGES, SHIPMENT_STAGE_KEYS } from "./stages";

/**
 * Request bodies for the shipments board (098). Shared by the routes and the
 * forms, and every schema parses its own output: the form parses, the route
 * parses the same value again.
 */

/**
 * A number a customer can dial: a Ghana number in any written form, or an
 * international one with `+`/`00`. Stored E.164 with the `+`. Blank is null.
 */
export const contactPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    const digits = normaliseWhatsAppPhone(value);
    if (!digits) {
      ctx.addIssue({ code: "custom", message: "Enter a phone number like 024 412 3456 or +1 212 555 0100" });
      return z.NEVER;
    }
    return `+${digits}`;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-14")
  .nullish()
  .transform((v) => v || null);

/** Packages, loose orders, or both. At least one between them. */
const targets = {
  package_ids: z.array(z.uuid()).max(100).default([]),
  order_ids: z.array(z.uuid()).max(300).default([]),
};

const hasTarget = (v: { package_ids: string[]; order_ids: string[] }) =>
  v.package_ids.length + v.order_ids.length > 0;

export const moveShipmentsSchema = z
  .object({
    ...targets,
    stage: z.enum(MOVABLE_STAGES),
    /** Shown to the customer under the step, and in the email. */
    message: optionalText(300),
    location: optionalText(80),
    /** When it happened, if not now — logging this morning what landed last night. */
    occurred_at: z.iso.datetime({ offset: true }).nullish().transform((v) => v || null),
    contact_name: optionalText(80),
    contact_phone: contactPhoneSchema,
    notify: z.boolean().default(true),
    /**
     * 101: the rider taking these orders out. Same rules as the admin hand-off
     * (075): a Ghana number or an https ride link, provider derived server-side.
     */
    rider: courierHandoffSchema.nullish().transform((v) => v ?? null),
  })
  .refine(hasTarget, { message: "Choose at least one package or order" })
  .refine((v) => !v.rider || v.stage === "out_for_delivery", {
    message: "A rider goes with Out for delivery",
    path: ["rider"],
  });

export const shipmentNoticeSchema = z
  .object({
    ...targets,
    /** true writes "Back on track" and takes the notice down. */
    clear: z.boolean().default(false),
    message: optionalText(500),
    expected_on: isoDate,
    contact_name: optionalText(80),
    contact_phone: contactPhoneSchema,
    notify: z.boolean().default(true),
  })
  .refine(hasTarget, { message: "Choose at least one package or order" })
  .refine((v) => v.clear || !!v.message, { message: "Say what is causing the delay", path: ["message"] });

export const stageSettingSchema = z.object({
  stage: z.enum(SHIPMENT_STAGE_KEYS),
  title: z.string().trim().min(1, "Give the step a name").max(60),
  description: z.string().trim().min(1, "Say what happens at this step").max(300),
  contact_name: optionalText(80),
  contact_phone: contactPhoneSchema,
  contact_whatsapp: z.boolean().default(true),
  contact_hours: optionalText(80),
  typical_days: z.coerce.number().int().min(1).max(90).nullish().transform((v) => v ?? null),
});

export type MoveShipmentsInput = z.infer<typeof moveShipmentsSchema>;
export type ShipmentNoticeInput = z.infer<typeof shipmentNoticeSchema>;
export type StageSettingInput = z.infer<typeof stageSettingSchema>;
