import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { JourneyDetailView } from "@/features/journeys/components";
import { CourierCard } from "@/features/order-delivery/components/courier-card";
import { getCourierForViewer } from "@/features/order-delivery/services/courier.service";
import { getJourneyDetail } from "@/features/journeys/services/journey-detail.service";
import { APIError } from "@/lib/auth/api-helpers";
import { MetaPurchase } from "@/components/analytics/meta-purchase";
import { orderTotalGhs } from "@/features/journeys/order-facts";

export const metadata: Metadata = {
  title: "Order",
  description: "Where your parcel is, and what you paid for it.",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}

/**
 * `v2-detail` — one order and its journey.
 *
 * Server component, like the list: ownership, the event log, the carrier, the
 * ETA window and the payment are all resolved before the first byte. An order
 * that is not the viewer's 404s — `getJourneyDetail` raises the same
 * `APIError(404)` the orders API does, and it is turned into Next's own not-found
 * here so the customer gets the app's 404 page rather than an error boundary.
 *
 * This route also absorbed the deleted per-order checkout screen's job (Phase 4
 * F5): a legacy unpaid order is paid from here, and the Paystack return lands
 * back on this page with `?payment=`.
 */
export default async function OrderDetailPage({ params, searchParams }: Props) {
  const [{ id }, { payment }, user] = await Promise.all([
    params,
    searchParams,
    getAuthenticatedUser(),
  ]);
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/app/orders/${id}`)}`);

  try {
    // In parallel: the courier read is scoped to the viewer's own orders and
    // answers null for anything else, so it cannot leak ahead of the 404.
    const [journey, courier] = await Promise.all([
      getJourneyDetail(user, id),
      getCourierForViewer(user.id, id),
    ]);
    // A legacy single-order checkout returns here. `paidAt` comes from the
    // order's own `payment_received` event, so the URL alone reports nothing.
    const paidTotal =
      payment === "success" && journey.paidAt
        ? orderTotalGhs({ admin_total_ghs: journey.adminTotalGhs, pricing: journey.pricing })
        : null;
    return (
      <>
        <JourneyDetailView
          journey={journey}
          paymentOutcome={payment ?? null}
          courier={<CourierCard courier={courier} orderStatus={journey.status} />}
        />
        {paidTotal != null ? (
          <MetaPurchase
            purchase={{ id: `order:${journey.id}`, valueGhs: paidTotal, numItems: journey.item.quantity }}
          />
        ) : null}
      </>
    );
  } catch (error: unknown) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }
}
