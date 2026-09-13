import { z } from "zod";

/**
 * Ghanaian numbers as customers type them: 024 555 0192, +233 24 555 0192,
 * 0245550192.
 *
 * Exported because the account screen asks for a phone number too, and two
 * regexes would eventually disagree about what a number looks like — a form
 * would accept a value the other form rejects on the same account. One
 * definition, imported; see `src/features/account/schema.ts`.
 */
export const GHANA_PHONE_RE = /^\+?[0-9][0-9 ()-]{7,18}$/;
const PHONE_RE = GHANA_PHONE_RE;
/** GhanaPost GPS: two letters, three digits, four digits. */
const DIGITAL_ADDRESS_RE = /^[A-Z]{2}-\d{3,4}-\d{4}$/i;

const addressFields = {
  label: z.string().trim().min(1, "Give this address a name").max(40),
  recipient_name: z.string().trim().min(1, "Who receives it?").max(120),
  phone: z.string().trim().regex(PHONE_RE, "Enter a phone number we can call"),
  line1: z.string().trim().min(1, "Street or house").max(200),
  line2: z.string().trim().max(200).optional(),
  area: z.string().trim().max(80).optional(),
  city: z.string().trim().min(1, "City").max(80),
  region: z.string().trim().max(80).optional(),
  delivery_zone_id: z.uuid("Choose a delivery zone"),
  digital_address: z.string().trim().regex(DIGITAL_ADDRESS_RE, "GhanaPost GPS looks like GA-183-4310").optional(),
};

export const createAddressSchema = z.object({ ...addressFields, is_default: z.boolean().default(false) });
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

// Built from the bare fields, not `createAddressSchema.partial()`: a `.default()`
// survives partial() and would turn every PATCH into `{ is_default: false }`.
export const updateAddressSchema = z
  .object({ ...addressFields, is_default: z.boolean() })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const addressIdSchema = z.uuid("Unknown address");
