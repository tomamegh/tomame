/**
 * The warehouse board's stages: every order the hub deals with sits in exactly
 * one, from paid to delivered. Pure, so the board, the item page and the tests
 * share one rule, and a stage's count is always the length of its list.
 *
 * Built on the shipment ladder (`currentStageKey`, 098) for everything after
 * the hub, and on what the warehouse itself knows before it: a store tracking
 * number on the order (086), a hub arrival, a package.
 */

import { currentStageKey, type StageEvent } from "@/features/shipments/stages";

export const BOARD_STAGES = [
  "to_buy",
  "purchased",
  "on_way",
  "at_hub",
  "boxed",
  "in_flight",
  "in_accra",
  "out",
  "delivered",
] as const;

export type BoardStage = (typeof BOARD_STAGES)[number];

export type BoardTone = "coral" | "amber" | "blue" | "ink" | "green";

export interface BoardStageMeta {
  label: string;
  /** The verb on the row's button; null when nothing is left to do. */
  next: string | null;
  /** One sentence: what this stage means and what to do. */
  hint: string;
  /** Who acts here, for the hint line. */
  who: string;
  tone: BoardTone;
}

export const BOARD_STAGE_META: Record<BoardStage, BoardStageMeta> = {
  to_buy: {
    label: "Paid, not bought",
    next: "Mark purchased",
    hint: "The customer has paid. Nobody has bought it from the store yet, so no parcel is coming.",
    who: "Admins mark purchased.",
    tone: "coral",
  },
  purchased: {
    label: "Purchased · no tracking",
    next: "Add tracking",
    hint: "Bought from the store, but the store has not given a tracking number yet. Add it when the shipping email arrives.",
    who: "Admins and hub staff can add tracking.",
    tone: "amber",
  },
  on_way: {
    label: "On its way to hub",
    next: "Receive",
    hint: "The store has shipped it to the hub. Scan or tick it when it comes off the truck.",
    who: "Hub staff.",
    tone: "blue",
  },
  at_hub: {
    label: "At the hub",
    next: "Pack",
    hint: "Logged in at the hub. Tick one customer's items and pack them into one box.",
    who: "Hub staff.",
    tone: "blue",
  },
  boxed: {
    label: "Boxed",
    next: "Open box",
    hint: "In a box that has not flown yet. Weigh and seal it, print the label, ship it on the next Wed/Fri flight.",
    who: "Hub staff, from Boxes.",
    tone: "ink",
  },
  in_flight: {
    label: "In flight",
    next: "Arrived in Accra",
    hint: "On a Delta Cargo flight from JFK to Accra. Move them when the flight lands.",
    who: "Staff.",
    tone: "ink",
  },
  in_accra: {
    label: "In Accra",
    next: "Out for delivery",
    hint: "Landed in Accra. Hand it to a driver, or wait for the customer's pickup or own rider.",
    who: "Staff.",
    tone: "green",
  },
  out: {
    label: "Out for delivery",
    next: "Delivered",
    hint: "With a driver, or ready for pickup. The driver completes it with a photo and the customer's 6-digit code.",
    who: "Drivers; staff can confirm.",
    tone: "green",
  },
  delivered: {
    label: "Delivered",
    next: null,
    hint: "Delivered in the last 7 days. Older orders are found by searching their TM number.",
    who: "",
    tone: "green",
  },
};

/** The journey's three legs, each a run of stages: the strip groups by them. */
export const BOARD_LEGS = [
  { key: "buy", label: "Buy", stages: ["to_buy", "purchased"] },
  { key: "hub", label: "US hub", stages: ["on_way", "at_hub", "boxed"] },
  { key: "ghana", label: "To the customer", stages: ["in_flight", "in_accra", "out", "delivered"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; stages: readonly BoardStage[] }>;

/** Stages where work is waiting on us: their counts are drawn as a call to act. */
export const ACTION_STAGES: readonly BoardStage[] = ["to_buy", "purchased", "on_way", "at_hub"];

/** How long a delivered order stays on the board. */
export const BOARD_DELIVERED_DAYS = 7;

export interface BoardStageInput {
  order_status: string;
  /** Logged in at the hub (a `hub_received` event). */
  received: boolean;
  /** At least one store tracking number on the order. */
  has_tracking: boolean;
  /** The package it is in, if any. */
  package_status: "packing" | "sealed" | "shipped" | "voided" | null;
  events: readonly StageEvent[];
}

/** The one stage an order is in. Null for orders the warehouse never shows (unpaid, cancelled). */
export function boardStageOf(input: BoardStageInput): BoardStage | null {
  const status = input.order_status;
  if (status === "delivered" || status === "completed") return "delivered";
  if (status !== "paid" && status !== "processing" && status !== "in_transit") return null;

  const pkg = input.package_status === "voided" ? null : input.package_status;
  if (pkg === "packing" || pkg === "sealed") return "boxed";

  if (pkg === "shipped" || status === "in_transit") {
    switch (currentStageKey(status, input.events)) {
      case "delivered":
        return "delivered";
      case "out_for_delivery":
      case "ready_for_pickup":
        return "out";
      case "arrived_country":
      case "ghana_warehouse":
        return "in_accra";
      default:
        return "in_flight";
    }
  }

  if (input.received) return "at_hub";
  if (status === "paid") return "to_buy";
  return input.has_tracking ? "on_way" : "purchased";
}

/** Counts per stage, from the same list the board shows: the count IS the list length. */
export function countByStage<T extends { board_stage: BoardStage }>(items: readonly T[]): Record<BoardStage, number> {
  const counts = Object.fromEntries(BOARD_STAGES.map((s) => [s, 0])) as Record<BoardStage, number>;
  for (const item of items) counts[item.board_stage] += 1;
  return counts;
}

export function isBoardStage(value: unknown): value is BoardStage {
  return typeof value === "string" && (BOARD_STAGES as readonly string[]).includes(value);
}
