import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { stampOrderPromise } from "@/db/queries/order-promise";
import { loadDeliveryWindow, type EtaCountry } from "@/features/quotes/services/delivery-eta.service";
import { logger } from "@/lib/logger";

import type { Order } from "../types";

const ETA_COUNTRIES: readonly EtaCountry[] = ["USA", "UK", "CHINA"];

/**
 * The first-stage delivery promise (Seamless Roadmap, Initiative 2; 123): the
 * usual window, counted from the day the customer paid, written once as the
 * order turns paid. Every screen and message after payment reads it, and the
 * accuracy numbers measure against it. The firm date (the flight) comes later,
 * from the store's tracking.
 *
 * Never throws: a missing promise must not stop a payment settling.
 */
export async function stampDeliveryPromise<T extends Pick<Order, "id" | "origin_country" | "promised_at">>(
  admin: SupabaseClient,
  order: T,
  now: Date = new Date(),
): Promise<T> {
  if (order.promised_at) return order;
  const country = ETA_COUNTRIES.find((c) => c === order.origin_country?.toUpperCase());
  if (!country) return order;
  try {
    const window = await loadDeliveryWindow(country, now);
    if (!window) return order;
    const row = await stampOrderPromise(admin, order.id, window, now);
    return row ? { ...order, ...row } : order;
  } catch (err) {
    logger.error("delivery promise: stamp failed", { orderId: order.id, error: err instanceof Error ? err.message : String(err) });
    return order;
  }
}
