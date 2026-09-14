import type { AdminTone } from "@/components/layout/admin";

/**
 * Display and parsing helpers for `/admin/content`.
 *
 * The content layer (migrations 036–040, amended by 048) has never had an
 * administrator: every one of these tables has been edited by hand in SQL. The
 * risk in giving it one is not that an admin cannot find the row — it is that
 * a stored value has a SHAPE that something downstream depends on, and a text
 * box will happily destroy it.
 *
 * `site_settings.payment_channels` is the sharp edge. 037 seeded it as an array
 * of plain label strings for the footer; 048 replaced it with an array of
 * objects carrying `paystack_channel`, `provider` and `dot`, because the bag's
 * pay selector passes `paystack_channel` straight to Paystack's `channels[]`.
 * The footer reads either shape (`readStringArray` in
 * `marketing-content.service.ts` accepts both), so flattening it back to labels
 * would leave the marketing site looking correct while the bag lost its
 * channels. That is why this file classifies a setting's shape rather than
 * treating every value as text, and why the route validates the parsed JSON
 * against a schema before it is written.
 *
 * Pure. British English.
 */

// ── Setting shapes ───────────────────────────────────────────────────────────

/**
 * How a setting's JSONB value should be edited.
 *
 * `text` is a bare JSON string — the vast majority (`whatsapp_number`,
 * `support_hours`, `company_address`, `payment_hold_note`). Everything else is
 * edited as JSON, because collapsing an object into a friendly form and back is
 * exactly where a required key goes missing.
 */
export type SettingShape = "text" | "json";

export function settingShape(value: unknown): SettingShape {
  return typeof value === "string" ? "text" : "json";
}

/** A JSON string's contents, or pretty-printed JSON for anything else. */
export function settingToEditorValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export interface SettingParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Turn what the admin typed back into a JSONB value.
 *
 * A `text` setting is stored as a JSON string, so the raw text IS the value —
 * no parsing, and therefore no way for an apostrophe in "Accra, Ghana" to
 * become a syntax error. A `json` setting must parse, and a failure is reported
 * with the parser's own message rather than swallowed: an admin who has broken
 * their JSON needs to know where.
 */
export function parseSettingInput(shape: SettingShape, raw: string): SettingParseResult {
  if (shape === "text") return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That is not valid JSON.",
    };
  }
}

/**
 * The warning shown above a setting an admin is about to edit, when one is
 * warranted.
 *
 * Only for the keys where the shape is load-bearing somewhere the admin cannot
 * see. A generic "be careful" on every row would be noise, and noise is how the
 * one row that mattered gets skipped.
 */
export function settingWarning(key: string): string | null {
  switch (key) {
    case "payment_channels":
      return "The bag's pay selector reads this. Every entry must keep its `paystack_channel` (mobile_money or card). That value is sent to Paystack. Removing it takes the channel off checkout while the footer carries on showing the label.";
    case "fees_worked_example":
      return "Input only. The Fees page prices this live through the pricing engine, so the figures on the page are never taken from here, but the shape must match workedExampleInputSchema or the worked example stops rendering.";
    case "whatsapp_number":
      return "Shown in the marketing footer, on the contact page and on Home's “Ask a buyer” card. It is the number customers actually message.";
    default:
      return null;
  }
}

/** Whether a setting is readable by signed-out visitors, in words. */
export function settingVisibility(isPublic: boolean): { label: string; tone: AdminTone } {
  return isPublic
    ? { label: "Public", tone: "neutral" }
    : { label: "Private", tone: "muted" };
}

// ── Regions ──────────────────────────────────────────────────────────────────

export type RegionStatus = "live" | "soon" | "off";

/**
 * What a lane's status means to a customer.
 *
 * `live` is the only purchasable one. `soon` renders the lane card with a
 * waitlist form instead of a buy path, and `off` hides it entirely — so this
 * dropdown rewrites the storefront's "Where we buy" page with no deploy, which
 * is the whole point of the table and the reason the wording is spelled out
 * rather than left as three slugs.
 */
export function regionStatusBadge(status: RegionStatus): { label: string; tone: AdminTone } {
  switch (status) {
    case "live":
      return { label: "Live", tone: "green" };
    case "soon":
      return { label: "Coming soon", tone: "amber" };
    case "off":
      return { label: "Hidden", tone: "muted" };
  }
}

export function regionStatusHelp(status: RegionStatus): string {
  switch (status) {
    case "live":
      return "Customers can buy from this region. It appears on “Where we buy” with its stores and transit window.";
    case "soon":
      return "The lane shows on “Where we buy” with a waitlist form instead of a buy path. Signups land in the waitlist below.";
    case "off":
      return "The lane is hidden from the storefront entirely.";
  }
}

/** "7–14 days", "from 7 days", or null when neither bound is set. */
export function transitWindowLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${min}–${max} days`;
  if (min != null) return `from ${min} days`;
  if (max != null) return `up to ${max} days`;
  return null;
}

// ── Delivery zones ───────────────────────────────────────────────────────────

/**
 * Whether a fee edit needs a confirmation.
 *
 * `delivery_zones.fee_ghs` is charged once per checkout on the bag's chosen
 * zone (CLAUDE.md's bag pricing), so every change to it is a change to what a
 * customer pays. Every one of them is confirmed and audited — there is no
 * "small enough to wave through" threshold, because the mistake this guards
 * against is a typo, and a typo has no size.
 */
export function isFeeChange(previous: number, next: number): boolean {
  return previous !== next;
}

/**
 * The sentence in the fee confirmation.
 *
 * Names both figures. "Are you sure?" over a field the admin has just typed
 * into tells them nothing they do not already believe.
 */
export function feeChangeWarning(zoneName: string, previous: number, next: number): string {
  const direction = next > previous ? "more" : "less";
  return `From the moment this saves, every customer who picks ${zoneName} at checkout will be charged GH₵${next.toFixed(
    2,
  )} instead of GH₵${previous.toFixed(2)}. That is ${direction} than they pay today.`;
}
