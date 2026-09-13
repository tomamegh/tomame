import type { Metadata } from "next";
import { cookies } from "next/headers";

import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { findLatestPendingGroupForUser } from "@/db/queries/order-groups";
import { listAddresses } from "@/features/addresses/services/addresses.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { BagView } from "@/features/bag/components";
import { getBag } from "@/features/bag/services/bag.service";
import { getBagPaymentSettings } from "@/features/payments/services/payment-channels.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";

export const metadata: Metadata = {
  title: "Your bag",
  description: "Everything you are buying, grouped by the box it travels in.",
};

/**
 * `v2-bag` — the bag & pay screen.
 *
 * Server component: resolves the viewer (session or quote cookie), prices the
 * bag once for the first paint, and reads everything the Deliver-to card and
 * the pay rail need — the active zones, the viewer's addresses, the admin's
 * payment channels and the hold note. The client island then owns mutations
 * and refetches. Public like the rest of the quote flow
 * (`src/lib/supabase/proxy.ts`); checkout is where sign-in is asked for.
 */
export default async function BagPage() {
  const userPromise = getAuthenticatedUser();
  const [user, cookieStore, zones, payment, addresses, pendingGroup] = await Promise.all([
    userPromise,
    cookies(),
    listActiveDeliveryZones(),
    // Channels and the hold note live in the same `site_settings` row: one read, both.
    getBagPaymentSettings(),
    // Addresses are owner-only: a signed-out viewer has none to load.
    userPromise.then((u) => (u ? listAddresses(u.id) : [])),
    // A checked-out, unpaid bag: shown when the open bag is empty so a declined payment can be retried.
    userPromise.then((u) => (u ? findLatestPendingGroupForUser(u.id) : null)),
  ]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const bag = await getBag(viewer);

  return (
    <BagView
      initialBag={bag}
      zones={zones}
      addresses={addresses}
      paymentChannels={payment.channels}
      paymentHoldNote={payment.holdNote}
      isSignedIn={!!user}
      pendingGroup={pendingGroup ? { id: pendingGroup.id, item_count: pendingGroup.item_count, total_ghs: pendingGroup.total_ghs } : null}
      renderedAt={new Date().toISOString()}
    />
  );
}
