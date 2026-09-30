/**
 * Placeholders an admin can write into `site_content` text and policy markdown,
 * filled from live data at render time.
 *
 * `{pickup_point}` is `site_settings.pickup_point` ("our Weija hub"), so the
 * pickup location is named in one place (Admin → Content → Settings).
 *
 * `{delivery_window}` is the live lane's `regions.transit_days_min/max`
 * ("5–7 days"), edited in Admin → Content → Lanes. Copy that states a
 * delivery time carries the token instead of the number, so changing the
 * region's transit days changes every sentence at once and the marketing site
 * can never disagree with the quote's ETA, which reads the same columns.
 *
 * Pure: the resolver that reads `regions` is in the marketing service.
 */

import type { RegionRow } from "@/db/queries/regions";
import type { SiteContentRow } from "@/db/queries/site-content";
import { transitWindowLabel } from "./components/admin-content-format";

export const CONTENT_TOKENS = ["delivery_window", "pickup_point"] as const;

export type ContentToken = (typeof CONTENT_TOKENS)[number];

/** null = the token has no value right now (e.g. transit days not set). */
export type ContentTokenValues = Record<ContentToken, string | null>;

/** Shown in the admin editors so the token is discoverable where copy is written. */
export const CONTENT_TOKEN_HELP =
  "Write {delivery_window} wherever a delivery time belongs. It prints the live region's transit days (Content → Lanes), e.g. “5–7 days”. {pickup_point} prints the Settings “Pickup point”, e.g. “our Weija hub”. In a policy, {shipping_methods} prints the published shipping methods as a list.";

/**
 * The shipping policy's `{shipping_methods}`: one markdown bullet per
 * published `shipping_method` row — "- **Air freight**: 5–7 days from payment
 * to your door. Every order flies this way." The window is the row's
 * `data.window` cell and the note its body; either may be empty. Rows arrive
 * already filled and filtered to the published ones.
 */
export function shippingMethodsMarkdown(rows: readonly SiteContentRow[]): string {
  return rows
    .filter((row) => row.title)
    .map((row) => {
      const span = typeof row.data.window === "string" ? row.data.window.trim() : "";
      const note = row.body?.trim() ?? "";
      const text = [span ? `${span}.` : "", note].filter(Boolean).join(" ");
      return text ? `- **${row.title}**: ${text}` : `- **${row.title}**`;
    })
    .join("\n");
}

const TOKEN_PATTERN = /\{(delivery_window|pickup_point)\}/g;

/**
 * The first live region's transit window — the lane the site sells today —
 * and the pickup point setting.
 */
export function contentTokenValues(
  regions: readonly RegionRow[],
  settings: Readonly<Record<string, unknown>> = {},
): ContentTokenValues {
  const live = regions.find((region) => region.status === "live") ?? null;
  const pickup = typeof settings.pickup_point === "string" ? settings.pickup_point.trim() : "";
  return {
    delivery_window: live ? transitWindowLabel(live.transit_days_min, live.transit_days_max) : null,
    pickup_point: pickup || null,
  };
}

/**
 * Fill every token in `text`. Null when a token has no value: a sentence with a
 * hole in it, or a made-up number, is worse than no sentence.
 */
export function fillContentTokens(text: string, values: ContentTokenValues): string | null {
  let unresolved = false;
  const filled = text.replace(TOKEN_PATTERN, (_match, token: ContentToken) => {
    const value = values[token];
    if (value == null) unresolved = true;
    return value ?? "";
  });
  return unresolved ? null : filled;
}

/**
 * A row with its title, body and top-level string `data` values filled, or
 * null when any of them names a token that has no value.
 */
export function fillRowTokens(row: SiteContentRow, values: ContentTokenValues): SiteContentRow | null {
  const fill = (text: string | null): string | null | undefined =>
    text == null ? text : (fillContentTokens(text, values) ?? undefined);

  const title = fill(row.title);
  const body = fill(row.body);
  if (title === undefined || body === undefined) return null;

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row.data)) {
    if (typeof value !== "string") {
      data[key] = value;
      continue;
    }
    const filled = fillContentTokens(value, values);
    if (filled == null) return null;
    data[key] = filled;
  }
  return { ...row, title, body, data };
}

/** `fillRowTokens` over a list, dropping the rows that cannot be filled. */
export function fillRowsTokens(rows: readonly SiteContentRow[], values: ContentTokenValues): SiteContentRow[] {
  const out: SiteContentRow[] = [];
  for (const row of rows) {
    const filled = fillRowTokens(row, values);
    if (filled) out.push(filled);
  }
  return out;
}
