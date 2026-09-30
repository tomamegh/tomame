import type { AdminTone } from "@/components/layout/admin/admin-page";

import type {
  ItemStage,
  PackageStatus,
  WarehouseItem,
  WarehousePackage,
  WarehouseRecipient,
} from "../types";

/**
 * Pure presentation rules for the packaging platform (081). No React, so they
 * are unit tested and shared by the pages, the label and the scan view.
 */

export const STAGE_META: Record<ItemStage, { label: string; tone: AdminTone; hint: string }> = {
  awaiting: { label: "Expected", tone: "muted", hint: "Paid for, not logged in at the hub yet" },
  received: { label: "On the shelf", tone: "amber", hint: "Logged in, waiting to be packed" },
  packed: { label: "Packed", tone: "coral", hint: "In a package that has not left" },
  shipped: { label: "Shipped", tone: "green", hint: "Left the hub" },
};

export const PACKAGE_META: Record<PackageStatus, { label: string; tone: AdminTone; verb: string }> = {
  packing: { label: "Packing", tone: "amber", verb: "Open on the bench" },
  sealed: { label: "Sealed", tone: "coral", verb: "Labelled, ready to leave" },
  shipped: { label: "Shipped", tone: "green", verb: "Left the hub" },
};

export function formatLbs(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return `${value.toFixed(digits).replace(/\.?0+$/, "") || "0"} lb`;
}

/** The weight a label prints: the scale's, else the estimate, marked as such. */
export function packageWeight(pkg: Pick<WarehousePackage, "weight_lbs" | "estimated_weight_lbs">): {
  value: number | null;
  estimated: boolean;
} {
  if (pkg.weight_lbs) return { value: pkg.weight_lbs, estimated: false };
  return { value: pkg.estimated_weight_lbs, estimated: pkg.estimated_weight_lbs !== null };
}

export function formatDimensions(
  pkg: Pick<WarehousePackage, "length_in" | "width_in" | "height_in">,
): string | null {
  const dims = [pkg.length_in, pkg.width_in, pkg.height_in];
  if (dims.some((d) => !d)) return null;
  return `${dims.map((d) => Number(d).toString()).join(" × ")} in`;
}

/** "Osu, Accra" — the part of an address a person sorting parcels reads. */
export function recipientPlace(r: WarehouseRecipient): string | null {
  if (r.kind === "pickup") return r.zone_name ? `Pickup · ${r.zone_name}` : "Pickup point";
  const parts = [r.area, r.city].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return r.zone_name ?? r.region ?? null;
}

/** Address lines for the label, most specific first, blanks dropped. */
export function recipientLines(r: WarehouseRecipient): string[] {
  if (r.kind === "pickup") return [r.zone_name ? `Pickup point: ${r.zone_name}` : "Pickup point"];
  const cityLine = [r.area, r.city].filter(Boolean).join(", ");
  return [r.line1, r.line2, cityLine || null, r.region, r.digital_address ? `GPS ${r.digital_address}` : null].filter(
    (l): l is string => !!l,
  );
}

export function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase() || "?";
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

/** "3 min ago", "Yesterday", "12 Sep" — for activity, where the gist beats the stamp. */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "–";
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 172800) return "Yesterday";
  return formatShortDate(iso);
}

/** Group items by the person they belong to — how a bench is packed. */
export function groupByRecipient(items: WarehouseItem[]): Array<{
  key: string;
  recipient: WarehouseRecipient;
  items: WarehouseItem[];
}> {
  const groups = new Map<string, { key: string; recipient: WarehouseRecipient; items: WarehouseItem[] }>();
  for (const item of items) {
    const group = groups.get(item.customer_key);
    if (group) group.items.push(item);
    else groups.set(item.customer_key, { key: item.customer_key, recipient: item.recipient, items: [item] });
  }
  return [...groups.values()];
}

/** Case-insensitive match over what an operator would type: number, name, store, person. */
export function matchesQuery(item: WarehouseItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.order_no, item.title, item.store, item.recipient.name, item.recipient.phone, item.package?.reference]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().includes(q));
}

/** Why a package cannot be sealed yet, or null when it can. */
export function sealBlocker(pkg: Pick<WarehousePackage, "line_count" | "held_count" | "status">): string | null {
  if (pkg.status !== "packing") return null;
  if (pkg.line_count === 0) return "Add at least one item first.";
  if (pkg.held_count > 0) return `${pkg.held_count} item${pkg.held_count === 1 ? " is" : "s are"} on hold.`;
  return null;
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Keep a typed number to digits and one decimal point: "0.80.8" → "0.808". */
export function sanitiseDecimal(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}
