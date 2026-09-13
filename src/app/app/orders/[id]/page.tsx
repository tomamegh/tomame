import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { JourneyDetailView } from "@/features/journeys/components";
import { getJourneyDetail } from "@/features/journeys/services/journey-detail.service";
import { APIError } from "@/lib/auth/api-helpers";

export const metadata: Metadata = {
  title: "Journey",
  description: "Where your parcel is, and what you paid for it.",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}

/**
 * `v2-detail` — one journey.
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
export default async function JourneyDetailPage({ params, searchParams }: Props) {
  const [{ id }, { payment }, user] = await Promise.all([
    params,
    searchParams,
    getAuthenticatedUser(),
  ]);
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/app/orders/${id}`)}`);

  try {
    const journey = await getJourneyDetail(user, id);
    return <JourneyDetailView journey={journey} paymentOutcome={payment ?? null} />;
  } catch (error: unknown) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }
}
