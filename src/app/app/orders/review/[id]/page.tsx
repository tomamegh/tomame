import type { Metadata } from "next";

import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { pickDefaultDoorZone } from "@/features/delivery/zones";
import { QuoteView } from "@/features/quotes/components";
import { loadQuoteAssurances } from "@/features/quotes/services/quote-assurance.service";

export const metadata: Metadata = {
  title: "Landed price",
  description:
    "The full cedi price of an international item, delivered to your door in Ghana.",
};

/**
 * `v2-quote` — the landed price a customer sees before they commit.
 *
 * A server component for everything that is the same for every viewer: the
 * delivery zone the quote assumes and the assurance copy under the receipt,
 * both read from the database here and passed down as props.
 *
 * The quote ITSELF is fetched by the client island. `GET /api/extractions/:id`
 * mints or reuses the viewer's rate lock and sets the anonymous quote-session
 * cookie in its response; a server component cannot set a cookie while
 * rendering, so fetching the quote here would hand every anonymous visitor a
 * new lock on every navigation.
 *
 * No auth gate. `src/proxy.ts` carves `/app/orders/review` out as public — the
 * quote flow is open to visitors, and sign-in is asked for at the moment the
 * order is submitted.
 */
export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, zones, assurances] = await Promise.all([
    params,
    listActiveDeliveryZones(),
    loadQuoteAssurances(),
  ]);

  return (
    <QuoteView
      extractionId={id}
      deliveryZone={pickDefaultDoorZone(zones)}
      assurances={assurances}
    />
  );
}
