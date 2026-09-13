import type { Metadata } from "next";
import { cookies } from "next/headers";

import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { BagView } from "@/features/bag/components";
import { getBag } from "@/features/bag/services/bag.service";
import { pickDefaultDoorZone } from "@/features/delivery/zones";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";

export const metadata: Metadata = {
  title: "Your bag",
  description: "Everything you are buying, grouped by the box it travels in.",
};

/**
 * `v2-bag` — the bag & pay screen.
 *
 * Server component: resolves the viewer (session or quote cookie), prices the
 * bag once for the first paint and reads the default door zone for the
 * delivery row. The client island then owns mutations and refetches. Public
 * like the rest of the quote flow (`src/lib/supabase/proxy.ts`); checkout is
 * where sign-in is asked for.
 */
export default async function BagPage() {
  const [user, cookieStore, zones] = await Promise.all([getAuthenticatedUser(), cookies(), listActiveDeliveryZones()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const bag = await getBag(viewer);

  return <BagView initialBag={bag} deliveryZone={pickDefaultDoorZone(zones)} renderedAt={new Date().toISOString()} />;
}
