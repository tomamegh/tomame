import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

// ── Row types ───────────────────────────────────────────────────────────────

/** Keys seeded by 037_seed_marketing_content.sql. Admins may add more. */
export const SITE_SETTING_KEYS = [
  "whatsapp_number",
  "support_hours",
  "company_address",
  "payment_channels",
  "payment_hold_note",
  "payment_expiry_minutes",
  "unpaid_order_ttl_hours",
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export interface SiteSettingRow {
  key: string;
  /** JSONB — a string, number, boolean, array or object. Narrowed by callers. */
  value: unknown;
  label: string;
  description: string;
}

/**
 * key → JSONB value. Values stay `unknown` here because the column is JSONB;
 * coercing them into `string` / `string[]` is the service layer's job.
 */
export type SiteSettingsMap = Record<string, unknown>;

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Public settings only, through the COOKIELESS anon client.
 *
 * Deliberately different from `getAllSiteSettings` below — do not "make these
 * consistent". The RLS SELECT policy is `USING (is_public)`, so anon sees
 * exactly the keys meant for visitors, which is all the marketing pages need.
 * Reading them without cookies is what keeps those pages statically
 * renderable: touching `cookies()` opts a route out of static rendering and
 * throws outright during `next build` (see `@/lib/supabase/public`).
 */
export async function getSiteSettingsMap(): Promise<SiteSettingsMap> {
  const client = createPublicClient();
  const { data, error } = await client.from("site_settings").select("key, value");

  if (error) {
    throw new Error(`Failed to load site settings: ${error.message}`);
  }

  const map: SiteSettingsMap = {};
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    map[String(row.key)] = row.value;
  }
  return map;
}

/**
 * Full rows, for an admin editor. Ordered by key so the list is stable.
 *
 * Uses the COOKIE-BEARING server client, unlike `getSiteSettingsMap` above —
 * do not "make these consistent". `site_settings.is_public` defaults to FALSE
 * and the anon SELECT policy is `USING (is_public)`, so the cookieless client
 * would silently return only the handful of public keys and never error: an
 * editor built on it would quietly hide every private setting. The session
 * cookie is what lets the admin RLS policy see who is asking and return the
 * whole table. A non-admin caller still gets only the public rows, so the
 * calling route must do its own admin check.
 */
export async function getAllSiteSettings(): Promise<SiteSettingRow[]> {
  const client = await createClient();
  const { data, error } = await client
    .from("site_settings")
    .select("key, value, label, description")
    .order("key");

  if (error) {
    throw new Error(`Failed to load site settings: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    key: String(row.key),
    value: row.value,
    label: row.label != null ? String(row.label) : "",
    description: row.description != null ? String(row.description) : "",
  }));
}
