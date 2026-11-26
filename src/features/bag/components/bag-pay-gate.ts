import { hasContactDetails, phoneLooksIncomplete, type ContactDetails } from "@/features/account/contact-details";
import { isContactPhone } from "@/features/addresses/phone";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { BagView } from "../types";
import { payBlockReason } from "./format";

export interface BagPayGateInput {
  bag: BagView;
  isSignedIn: boolean;
  contact: ContactDetails | null;
  addresses: DeliveryAddress[];
  /** `useBagPayment().momoReady`: false while MoMo is chosen without a usable number. */
  momoReady: boolean;
}

/**
 * Whether Pay may start, and the one sentence saying why not. Shared by the bag
 * page and the quote's checkout panel (Seamless Roadmap, Initiative 1) so the
 * two can never disagree. The server re-checks all of it at checkout.
 *
 * A signed-out viewer keeps a live button: it sends them to sign in.
 */
export function bagPayGate({ bag, isSignedIn, contact, addresses, momoReady }: BagPayGateInput): {
  blocked: boolean;
  reason: string | null;
} {
  const hasContact = !!(contact && hasContactDetails(contact));
  // Fix 5: an incomplete number (on the profile or the chosen address) is flagged before Pay.
  const phoneIncomplete = !!(contact && phoneLooksIncomplete(contact));
  const chosenAddress = bag.delivery?.address_id ? addresses.find((a) => a.id === bag.delivery?.address_id) : undefined;
  const addressPhoneIncomplete = !!chosenAddress && !isContactPhone(chosenAddress.phone);
  const blocked =
    bag.lines.length === 0 ||
    bag.has_unpriced_lines ||
    bag.has_sourcing_lines ||
    // A held line (price or stock being confirmed, or unavailable) cannot be
    // paid for; checkout would refuse it with a 409 (pay-gate.ts).
    bag.has_pay_holds === true ||
    // 142: a line without its size/colour; checkout refuses it.
    bag.has_missing_options === true ||
    (isSignedIn && !bag.delivery) ||
    (isSignedIn && !hasContact) ||
    (isSignedIn && addressPhoneIncomplete) ||
    (isSignedIn && !momoReady);
  // A MoMo number is the last thing asked for, so every other reason is said first.
  const reason = blocked
    ? (payBlockReason(bag, { isSignedIn, hasContact, phoneIncomplete, addressPhoneIncomplete }) ??
      (isSignedIn && !momoReady ? "Enter your Mobile Money number to pay." : null))
    : null;
  return { blocked, reason };
}
