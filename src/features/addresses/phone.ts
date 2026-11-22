import { formatGhanaPhone, normaliseGhanaPhone } from "@/features/order-delivery/schema";

/**
 * One phone rule for the bag, the address book and the profile (site brief Fix 5).
 *
 * A Ghana number must be complete: `024 412 3456`, `+233 24 412 3456` and the
 * usual spellings normalise to `+233244123456`; a nine-digit slip like
 * `024409801` is refused, where the old shape check let it through. A number
 * from abroad is accepted in international form (`+44…`, `+1…`). Stored
 * normalised, so the same number reads the same everywhere it is shown.
 */
export function normaliseContactPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ghana = normaliseGhanaPhone(raw);
  if (ghana) return ghana;
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  // International, not Ghana (a 233 number that failed above is an incomplete Ghana number).
  const m = /^(?:\+|00)([1-9]\d{7,14})$/.exec(compact);
  if (m && !m[1]!.startsWith("233")) return `+${m[1]}`;
  return null;
}

export const isContactPhone = (raw: string | null | undefined): boolean => normaliseContactPhone(raw) !== null;

/** How a stored number is shown: `+233 24 412 3456`. Anything unparseable is shown as stored. */
export function displayPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const n = normaliseContactPhone(raw);
  return n ? formatGhanaPhone(n) : raw;
}

export const CONTACT_PHONE_MESSAGE = "Enter the full number, like 024 412 3456";
