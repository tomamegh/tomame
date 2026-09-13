import type { DeliveryAddress } from "./types";

/** "Home · East Legon" — the one way an address is named on screen and in `BagDelivery.label`. Pure; shared by server and client. */
export function formatAddressLabel(address: Pick<DeliveryAddress, "label" | "area" | "city">): string {
  return `${address.label} · ${address.area ?? address.city}`;
}
