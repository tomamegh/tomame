import type { DeliveryAddress } from "./types";

/** "Home · East Legon" — the one way an address is named on screen and in `BagDelivery.label`. Pure; shared by server and client. */
export function formatAddressLabel(address: Pick<DeliveryAddress, "label" | "area" | "city">): string {
  return `${address.label} · ${address.area ?? address.city}`;
}

/**
 * The address as one block, exactly as the customer entered it (site brief
 * Fix 5): street, second line, area and city, region. No label, so a label
 * that is itself a street name cannot read as a second address.
 */
export function addressBlockLines(address: Pick<DeliveryAddress, "line1" | "line2" | "area" | "city" | "region">): string[] {
  const place = [address.area, address.city].filter((v): v is string => !!v && v.trim() !== "").join(", ");
  return [address.line1, address.line2, place, address.region]
    .map((v) => (v ?? "").trim())
    .filter((v, i, all) => v !== "" && all.indexOf(v) === i);
}
