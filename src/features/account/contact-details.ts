import { isContactPhone } from "@/features/addresses/phone";

/**
 * The contact details every order needs: who the customer is and a number we
 * can call. Without them ops cannot confirm an item, chase a payment or hand a
 * courier a name — so no order is placed until all three are on the profile.
 *
 * Pure, so the bag screen and the server guard read the same rule.
 */
export interface ContactDetails {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

export type ContactField = "first_name" | "last_name" | "phone";

const filled = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

export function missingContactDetails(profile: ContactDetails): ContactField[] {
  const missing: ContactField[] = [];
  if (!filled(profile.first_name)) missing.push("first_name");
  if (!filled(profile.last_name)) missing.push("last_name");
  // Fix 5: complete numbers only; a stored nine-digit slip is flagged before Pay.
  if (!filled(profile.phone) || !isContactPhone(profile.phone)) missing.push("phone");
  return missing;
}

export const hasContactDetails = (profile: ContactDetails): boolean => missingContactDetails(profile).length === 0;

export const CONTACT_DETAILS_REQUIRED_MESSAGE = "Add your full name and phone number before you place an order.";

/** A phone is on the profile but is not a complete number (Fix 5). */
export const phoneLooksIncomplete = (profile: ContactDetails): boolean =>
  filled(profile.phone) && !isContactPhone(profile.phone);
