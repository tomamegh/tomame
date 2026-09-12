import type { Icon } from "@phosphor-icons/react";
import {
  AirplaneTilt,
  ArrowsLeftRight,
  Bank,
  Bell,
  BookmarkSimple,
  ChatCircleDots,
  DeviceMobile,
  Eye,
  HandHeart,
  HouseLine,
  Lightning,
  LinkSimple,
  Package,
  Receipt,
  ShieldCheck,
  Tag,
  Truck,
} from "@phosphor-icons/react/ssr";

import type { WorkedExampleRowKey } from "@/features/marketing/types";

/**
 * `site_content.data->>'icon'` stores a Phosphor name ("LinkSimple"). Icons
 * cannot be looked up dynamically in a server component without pulling the
 * whole barrel into the RSC graph, so the seeded names are mapped explicitly
 * and anything unrecognised falls back rather than crashing the page.
 */
const ICONS_BY_NAME: Record<string, Icon> = {
  AirplaneTilt,
  ArrowsLeftRight,
  Bank,
  Bell,
  BookmarkSimple,
  ChatCircleDots,
  DeviceMobile,
  Eye,
  HandHeart,
  HouseLine,
  Lightning,
  LinkSimple,
  Package,
  Receipt,
  ShieldCheck,
  Tag,
  Truck,
};

export function iconByName(name: unknown, fallback: Icon = Package): Icon {
  return typeof name === "string" ? (ICONS_BY_NAME[name] ?? fallback) : fallback;
}

/** Reads `data.icon` off a `site_content` row's free-form payload. */
export function rowIcon(
  data: Record<string, unknown>,
  fallback: Icon = Package,
): Icon {
  return iconByName(data.icon, fallback);
}

/** One glyph per receipt line, keyed by the pricing engine's row key. */
export const RECEIPT_ROW_ICONS: Record<WorkedExampleRowKey, Icon> = {
  item: Tag,
  tax: Bank,
  fee: HandHeart,
  freight: AirplaneTilt,
  exchange_rate: ArrowsLeftRight,
};
