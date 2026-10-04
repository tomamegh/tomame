import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import { CONTACT_DETAILS_REQUIRED_MESSAGE, hasContactDetails } from "../contact-details";

/**
 * Refuses to start an order for an account with no name or phone. `user.profile`
 * is the full `profiles` row (`getAuthenticatedUser` selects `*`), so this costs
 * no extra read. 409: the request is fine, the account is not ready for it yet.
 */
export function requireContactDetails(user: PlatformUser): void {
  if (!hasContactDetails(user.profile)) throw new APIError(409, CONTACT_DETAILS_REQUIRED_MESSAGE);
}
