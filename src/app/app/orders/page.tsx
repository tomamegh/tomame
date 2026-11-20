import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { JourneysView } from "@/features/journeys/components";
import { getJourneys, getPaidBagPurchase } from "@/features/journeys/services/journeys.service";
import { MetaPurchase } from "@/components/analytics/meta-purchase";

export const metadata: Metadata = {
  title: "Your orders",
  description: "Every order, and its journey from the store to your door.",
};

interface Props {
  searchParams: Promise<{ payment?: string; group?: string }>;
}

/**
 * `v2-journeys` — the customer's orders, each with its own journey.
 *
 * Server component: the whole view model is assembled server-side (filter
 * counts, the five-stop census, each row's stage position) and handed down as
 * pure props. Nothing in the client tree fetches orders.
 *
 * `payment` is read here rather than with `useSearchParams` in the client tree,
 * which would force this route out of its static shell. Paystack sends a
 * settled group back to `/app/orders?payment=success&group=…`.
 *
 * `src/proxy.ts` already gates `/app`; the redirect below is only for the
 * impossible case where the gate let a session through that has since lapsed —
 * `getJourneys` needs a user and must not be handed `null`.
 */
export default async function OrdersPage({ searchParams }: Props) {
  const [{ payment, group }, user] = await Promise.all([searchParams, getAuthenticatedUser()]);
  if (!user) redirect(`/auth/login?next=${encodeURIComponent("/app/orders")}`);

  const [data, purchase] = await Promise.all([
    getJourneys(user),
    payment === "success" ? getPaidBagPurchase(user.id, group) : null,
  ]);

  return (
    <>
      <JourneysView data={data} paymentOutcome={payment ?? null} />
      {purchase ? <MetaPurchase purchase={purchase} /> : null}
    </>
  );
}
