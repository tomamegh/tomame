import { GHANA_PHONE_RE } from "@/features/addresses/schema";

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
  if (!filled(profile.phone) || !GHANA_PHONE_RE.test(profile.phone.trim())) missing.push("phone");
  return missing;
}

export const hasContactDetails = (profile: ContactDetails): boolean => missingContactDetails(profile).length === 0;

export const CONTACT_DETAILS_REQUIRED_MESSAGE = "Add your full name and phone number before you place an order.";
