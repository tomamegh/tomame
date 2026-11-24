import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { findLatestPendingGroupForUser } from "@/db/queries/order-groups";
import { listAddresses } from "@/features/addresses/services/addresses.service";
import { currentUser } from "@/features/mobile/services/session.service";
import { getBag } from "@/features/bag/services/bag.service";
import { isPickupEnabled } from "@/features/bag/services/delivery-settings.service";
import { getBagPaymentSettings } from "@/features/payments/services/payment-channels.service";
import { getMomoPrefill } from "@/features/payments/services/momo.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { BagScreen } from "@/features/mobile/components/bag-screen";

/** The bag, read the same way as the website's `/app/bag`. */
export default async function MobileBagPage() {
  const user = await currentUser();
  if (!user) redirect("/m/welcome?next=%2Fm%2Fbag");
  const [cookieStore, zones, payment, addresses, pendingGroup, pickupEnabled, momoPrefill] = await Promise.all([
    cookies(),
    listActiveDeliveryZones(),
    getBagPaymentSettings(),
    listAddresses(user.id),
    findLatestPendingGroupForUser(user.id),
    isPickupEnabled(),
    getMomoPrefill(user.id, user.profile.phone ?? null),
  ]);
  const bag = await getBag({ userId: user.id, sessionId: readQuoteSessionFromCookies(cookieStore) });

  return (
    <BagScreen
      initialBag={bag}
      zones={zones}
      addresses={addresses}
      channels={payment.channels}
      pickupEnabled={pickupEnabled}
      contact={{ first_name: user.profile.first_name, last_name: user.profile.last_name, phone: user.profile.phone }}
      pendingGroup={pendingGroup ? { id: pendingGroup.id, item_count: pendingGroup.item_count, total_ghs: pendingGroup.total_ghs } : null}
      momoPrefill={momoPrefill}
    />
  );
}
