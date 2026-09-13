import { z } from "zod";

import { GHANA_PHONE_RE } from "@/features/addresses/schema";

/**
 * What `PATCH /api/app/me` accepts.
 *
 * One schema for the route and for the forms, so the browser and the server can
 * never disagree about what a valid value is — the same arrangement the address
 * dialog already uses.
 *
 * The phone rule is IMPORTED, not restated. `delivery_addresses.phone` and
 * `profiles.phone` are the same kind of thing typed by the same person, and two
 * copies of the pattern would drift until the Addresses tab accepted a number
 * the Profile tab refused on the same account.
 */

/**
 * A phone number, or an explicit clearing of it.
 *
 * `""` maps to `null` rather than failing: the field is optional, a customer
 * emptying it means "I no longer want you to have this", and a form that
 * refuses to let you delete what you typed is a trap. Anything else must look
 * like a number.
 */
export const accountPhoneSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || GHANA_PHONE_RE.test(value), {
    message: "Enter a phone number we can reach you on",
  });

/** Free text that may be blanked. Empty string means "remove it", same as above. */
function nullableText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((value) => (value === "" ? null : value));
}

export const updateAccountProfileSchema = z
  .object({
    first_name: nullableText(255, "First name must be 255 characters or less"),
    last_name: nullableText(255, "Last name must be 255 characters or less"),
    bio: nullableText(500, "Bio must be 500 characters or less"),
    phone: accountPhoneSchema,
    whatsapp_opt_in: z.boolean(),
    notify_email: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Nothing to update",
  });

export type UpdateAccountProfileInput = z.infer<typeof updateAccountProfileSchema>;

/**
 * The Notifications tab's two toggles on their own.
 *
 * A subset of the profile patch rather than its own endpoint: the preferences
 * live on the same row and the same PATCH writes them. This exists so the
 * toggle component can validate exactly what it sends.
 */
export const notificationPreferencesSchema = z.object({
  notify_email: z.boolean(),
  whatsapp_opt_in: z.boolean(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
