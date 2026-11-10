import * as z from "zod";

import type { ShipmentStageKey } from "@/features/shipments/stages";

import { courierHandoffSchema, type CourierProvider } from "./schema";

/**
 * The customer's own ride (migration 101), the pure half: who may ask, what
 * they send, and what the order page draws. No server imports, so the form
 * and the route validate with the same rules.
 *
 * Delivery from the Accra warehouse is free and stays the default. Sending a
 * rider is the customer's choice, on their own ride, for when they would
 * rather not wait.
 */

/** A rider can only collect once the parcel is at our Accra warehouse. */
export const OWN_RIDE_STAGES: readonly ShipmentStageKey[] = ["ghana_warehouse", "ready_for_pickup"];

export function canSendOwnRide(input: {
  status: string;
  held: boolean;
  stage: ShipmentStageKey | null;
  courierDispatched: boolean;
}): boolean {
  return (
    input.status === "in_transit" &&
    !input.held &&
    !input.courierDispatched &&
    !!input.stage &&
    OWN_RIDE_STAGES.includes(input.stage)
  );
}

/** Where the rider collects from. Every field may be blank until an admin fills it in. */
export interface PickupAddress {
  name: string;
  line1: string | null;
  area: string | null;
  city: string | null;
  digital_address: string | null;
  phone: string | null;
  hours: string | null;
  /** https only; anything else is dropped server-side. */
  maps_url: string | null;
}

export interface CustomerRideRequest {
  riderName: string | null;
  riderPhone: string | null;
  trackingUrl: string | null;
  provider: CourierProvider | null;
  eta: string | null;
  note: string | null;
  requestedAt: string;
}

export interface CustomerRideView {
  /** The customer may send (or change) a rider now. */
  eligible: boolean;
  /** Their open request, until the warehouse hands the parcel over. */
  request: CustomerRideRequest | null;
  /** Shown only to a customer who can or did send a rider. */
  pickup: PickupAddress | null;
}

const MAX_ETA_AHEAD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * `POST /api/orders/:id/ride`. The rider is the admin hand-off's own schema
 * (075): a Ghana number or an https ride link, the provider derived here.
 */
export const customerRideSchema = z.object({
  rider: courierHandoffSchema,
  eta: z.iso
    .datetime({ offset: true })
    .nullish()
    .transform((v) => v || null)
    .refine((v) => !v || Date.parse(v) > Date.now() - 60 * 60 * 1000, "Pick a time that has not passed")
    .refine((v) => !v || Date.parse(v) < Date.now() + MAX_ETA_AHEAD_MS, "Pick a time in the next three days"),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .nullish()
    .transform((v) => v || null),
});

export type CustomerRideInput = z.output<typeof customerRideSchema>;
