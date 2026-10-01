import { z } from "zod";

import { MAX_ALERT_RECIPIENTS, parseRecipients } from "@/features/ops/alert-recipients";

/**
 * Who hears about orders and payments, and which events they hear about (087).
 *
 * Same shape as the ops alert list (083): a private `site_settings` row,
 * validated, lower-cased and de-duplicated, at most 20 addresses.
 * `STAFF_ALERT_RECIPIENTS` (comma separated) replaces the list when set, so a
 * deployment that does send can be pointed somewhere other than the team.
 */

export const STAFF_RECIPIENTS_KEY = "staff_order_alert_recipients";
export const STAFF_EVENTS_KEY = "staff_order_alert_events";

export const STAFF_ALERT_EVENTS = [
  "order_placed",
  "payment_succeeded",
  "payment_failed",
  "order_status_changed",
  "order_review",
  "car_order",
] as const;
export type StaffAlertEvent = (typeof STAFF_ALERT_EVENTS)[number];

export const STAFF_EVENT_LABELS: Record<StaffAlertEvent, { label: string; detail: string }> = {
  order_placed: { label: "Order placed", detail: "A single order or a bag checkout" },
  payment_succeeded: { label: "Payment received", detail: "Orders, bags and car deposits" },
  payment_failed: { label: "Payment failed or abandoned", detail: "Declined at Paystack, or released after the expiry window" },
  order_status_changed: { label: "Order status changed", detail: "Processing, in transit, delivered, cancelled" },
  order_review: { label: "Review outcome", detail: "An admin approved, priced or rejected a flagged order" },
  car_order: { label: "Car orders", detail: "A car checkout started, cancelled or released" },
};

export const DEFAULT_STAFF_RECIPIENTS = [
  "albert.ahadjie@outlook.com",
  "benjaminbennin@yahoo.com",
  "kelanimdev@gmail.com",
] as const;

const address = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" }));

export const staffRecipientsSchema = z
  .array(address, { error: "A list of email addresses" })
  .min(1, "Keep at least one address")
  .max(MAX_ALERT_RECIPIENTS, `At most ${MAX_ALERT_RECIPIENTS} addresses`)
  .transform((list) => [...new Set(list)]);

export const staffEventsSchema = z
  .object(Object.fromEntries(STAFF_ALERT_EVENTS.map((e) => [e, z.boolean()])) as Record<StaffAlertEvent, z.ZodBoolean>)
  .partial()
  .strict()
  .transform((value) => normaliseEvents(value));

export const staffAlertSettingsSchema = z.object({
  recipients: staffRecipientsSchema,
  events: staffEventsSchema,
});
export type StaffAlertSettingsInput = z.infer<typeof staffAlertSettingsSchema>;

export type StaffEventToggles = Record<StaffAlertEvent, boolean>;

/** Every known event, on unless the stored object says `false`. Unknown keys dropped. */
export function normaliseEvents(value: unknown): StaffEventToggles {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(STAFF_ALERT_EVENTS.map((e) => [e, stored[e] !== false])) as StaffEventToggles;
}

export function resolveStaffRecipients(
  envValue: string | undefined,
  settingValue: unknown,
): { recipients: string[]; from: "env" | "setting" | "default" } {
  const fromEnv = envValue ? parseRecipients(envValue) : [];
  if (fromEnv.length) return { recipients: fromEnv, from: "env" };
  // A row that exists but was emptied is still read as the list: an empty
  // array cannot be saved through the admin route, so empty means "lost".
  const fromSetting = parseRecipients(settingValue);
  if (fromSetting.length) return { recipients: fromSetting, from: "setting" };
  return { recipients: [...DEFAULT_STAFF_RECIPIENTS], from: "default" };
}
