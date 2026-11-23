import type { DeliveryAddress } from "@/features/addresses/types";

/**
 * What an order group's "Deliver to" says (048): frozen at checkout, and
 * rewritten only when the customer changes it before the flight (Initiative 5),
 * so a later address-book edit never moves a parcel by itself. Pure.
 */
export type DeliverySnapshotTarget =
  | { kind: "pickup"; zone: { id: string; name: string; fee_ghs: number } }
  | { kind: "door"; address: DeliveryAddress | { id: string; label: string }; zone: { id: string; name: string; fee_ghs: number } };

export function deliverySnapshotOf(target: DeliverySnapshotTarget): Record<string, unknown> {
  const zone = { zone_id: target.zone.id, zone_name: target.zone.name, fee_ghs: target.zone.fee_ghs };
  return target.kind === "pickup" ? { kind: "pickup", ...zone } : { ...target.address, kind: "door", ...zone };
}
