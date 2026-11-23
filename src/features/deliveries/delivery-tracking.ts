import type { AccraLeg } from "@/db/queries/admin-deliveries";
import { DELTA_CARGO_TRACK_URL } from "@/features/warehouse/inbound/tracking-number";

/**
 * What the Deliveries board says about an order's tracking (site brief Fix 12).
 * The Accra leg's air waybill lives on the package the order flew in, so a
 * warehouse-shipped order is tracked even though the order row carries no
 * number. A delivered order with nothing recorded says so; it is never "Not
 * shipped yet".
 */
export type TrackingCell =
  | { kind: "tracked"; carrier: string; number: string; href: string | null; note: string | null }
  | { kind: "no_awb"; reason: string }
  | { kind: "untracked_moving" }
  | { kind: "none_recorded" }
  | { kind: "not_shipped" };

interface TrackingFacts {
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  no_tracking_reason?: string | null;
  tracking_url?: string | null;
}

const MOVED = new Set(["in_transit", "delivered", "completed"]);

export function trackingCellOf(order: TrackingFacts, leg: AccraLeg | null): TrackingCell {
  if (leg?.awb) {
    return { kind: "tracked", carrier: leg.carrier ?? "Delta Cargo", number: leg.awb, href: DELTA_CARGO_TRACK_URL, note: leg.package_reference };
  }
  if (order.tracking_number) {
    return { kind: "tracked", carrier: order.carrier ?? "Carrier not named", number: order.tracking_number, href: order.tracking_url ?? null, note: null };
  }
  const reason = order.no_tracking_reason?.trim() || leg?.no_tracking_reason?.trim();
  if (reason) return { kind: "no_awb", reason };
  if (order.status === "in_transit") return { kind: "untracked_moving" };
  if (MOVED.has(order.status) || leg?.shipped) return { kind: "none_recorded" };
  return { kind: "not_shipped" };
}

/** A dispatched order with no delivery window belongs on the exception list until one is set. */
export function missingWindow(order: { status: string }, eta: string | null): boolean {
  return order.status === "in_transit" && !eta;
}
