import "server-only";
import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { listAddresses } from "@/features/addresses/services/addresses.service";
import { getBagPaymentSettings } from "@/features/payments/services/payment-channels.service";
import { getMomoPrefill } from "@/features/payments/services/momo.service";
import { isPickupEnabled } from "./delivery-settings.service";
import type { PlatformUser } from "@/features/users/types";
import type { QuoteCheckoutData } from "../components/quote-checkout-sheet";

/**
 * What the quote's checkout panel needs, read when the panel opens rather than
 * on every quote render: the quote page is public and its renders were the
 * load behind the 2026-10-16 prod DB outage, so it does not pay for a
 * checkout most viewers never open. The same reads the bag page makes.
 */
export async function getCheckoutContext(user: PlatformUser | null): Promise<QuoteCheckoutData> {
  const [zones, payment, pickupEnabled, addresses, momoPrefill] = await Promise.all([
    listActiveDeliveryZones(),
    getBagPaymentSettings(),
    isPickupEnabled(),
    user ? listAddresses(user.id) : Promise.resolve([]),
    user ? getMomoPrefill(user.id, user.profile.phone ?? null) : Promise.resolve(null),
  ]);
  return {
    isSignedIn: !!user,
    zones,
    addresses,
    paymentChannels: payment.channels,
    paymentHoldNote: payment.holdNote,
    pickupEnabled,
    contact: user ? { first_name: user.profile.first_name, last_name: user.profile.last_name, phone: user.profile.phone } : null,
    momoPrefill,
  };
}
