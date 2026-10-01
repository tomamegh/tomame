import { after } from "next/server";

import { logger } from "@/lib/logger";
import type { StaffAlertEvent } from "./settings";

/**
 * The one call order and payment code makes (087): `notifyStaff(trigger)`.
 * Kept light on purpose; the sender (`staff-alerts.service.ts`) is imported
 * lazily when the work runs. See that file for idempotency and gating.
 */

export type StaffAlertTrigger =
  | { kind: "order_placed"; orderId: string }
  | { kind: "bag_placed"; groupId: string }
  | { kind: "payment_succeeded"; paymentId: string }
  | { kind: "payment_failed"; paymentId: string; reason: "declined" | "expired" }
  | { kind: "order_status"; orderId: string; from: string; to: string; by: string }
  | { kind: "bag_status"; groupId: string; from: string; to: string; by: string }
  | { kind: "order_review"; orderId: string; outcome: "approved" | "priced" | "rejected" }
  | { kind: "car_order"; carOrderId: string; action: "created" | "cancelled" | "released" };

/** Which toggle a trigger belongs to. */
export function eventOf(t: StaffAlertTrigger): StaffAlertEvent {
  switch (t.kind) {
    case "order_placed":
    case "bag_placed":
      return "order_placed";
    case "payment_succeeded":
      return "payment_succeeded";
    case "payment_failed":
      return "payment_failed";
    case "order_status":
    case "bag_status":
      return "order_status_changed";
    case "order_review":
      return "order_review";
    case "car_order":
      return "car_order";
  }
}

/** One email per event per order: the key names the thing that happened, once. */
export function eventKeyOf(t: StaffAlertTrigger): string {
  switch (t.kind) {
    case "order_placed":
      return `order_placed:order:${t.orderId}`;
    case "bag_placed":
      return `order_placed:group:${t.groupId}`;
    case "payment_succeeded":
      return `payment_succeeded:${t.paymentId}`;
    case "payment_failed":
      // Declined and expired are both terminal for one payment row, so one key.
      return `payment_failed:${t.paymentId}`;
    case "order_status":
      return `order_status:order:${t.orderId}:${t.to}`;
    case "bag_status":
      return `order_status:group:${t.groupId}:${t.to}`;
    case "order_review":
      return `order_review:${t.orderId}:${t.outcome}`;
    case "car_order":
      return `car_order:${t.carOrderId}:${t.action}`;
  }
}

export function entityOf(t: StaffAlertTrigger): { entity_type: string; entity_id: string } {
  switch (t.kind) {
    case "order_placed":
    case "order_status":
    case "order_review":
      return { entity_type: "order", entity_id: t.orderId };
    case "bag_placed":
    case "bag_status":
      return { entity_type: "order_group", entity_id: t.groupId };
    case "payment_succeeded":
    case "payment_failed":
      return { entity_type: "payment", entity_id: t.paymentId };
    case "car_order":
      return { entity_type: "car_order", entity_id: t.carOrderId };
  }
}

// ── The one call sites make ─────────────────────────────────────────────────

/**
 * Fire and forget, after the response. Never throws, never awaits anything the
 * caller has to wait for.
 */
export function notifyStaff(trigger: StaffAlertTrigger): void {
  const work = async () => {
    try {
      // Loaded here, not at the top: every order and payment service imports
      // this file, and the sender pulls in Resend, env and the service client.
      const { processStaffAlert } = await import("./staff-alerts.service");
      await processStaffAlert(trigger);
    } catch (error) {
      logger.error("staff alert failed", {
        key: eventKeyOf(trigger),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  try {
    after(work);
  } catch {
    // Outside a request scope (`after` throws there): run detached instead.
    void work();
  }
}

