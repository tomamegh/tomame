import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for the admin-owned content layer — `site_settings`,
 * `site_content`, `regions`, `delivery_zones`, `waitlist_signups` and
 * `media_overrides` (migrations 036–040, amended by 048).
 *
 * WHY A SEPARATE FILE FROM `site-settings.ts` / `regions.ts` / `delivery-zones.ts`.
 * Those read the STOREFRONT'S view: the cookieless anon client, narrowed by RLS
 * to the published / active / public rows a visitor is allowed to see. That is
 * exactly the wrong view for an administrator, who has to be able to see the
 * unpublished FAQ, the `soon` lane, the deactivated delivery zone and the
 * private setting — the rows the customer view exists to hide. Reading the
 * admin screen through those helpers would silently show a subset and never
 * error, which is the failure mode `getAllSiteSettings` already documents.
 *
 * So everything here goes through the service-role client. That client bypasses
 * RLS, which is why this file is `server-only` and why every route that calls it
 * must do its own `requireAdmin` first — the guard is in the route, not here
 * (CLAUDE.md: `db/queries` holds no auth checks and no business logic).
 *
 * Errors are NOT swallowed. An admin editing a table needs to be told that the
 * write failed; a screen that quietly renders an empty list on a broken query
 * is how an admin concludes there is nothing to edit.
 */

// ── site_settings ────────────────────────────────────────────────────────────

export interface AdminSiteSettingRow {
  key: string;
  /** JSONB: a string, number, boolean, array or object. Narrowed by callers. */
  value: unknown;
  label: string;
  description: string;
  /** false keeps the key away from signed-out visitors — the RLS SELECT gate. */
  is_public: boolean;
  updated_at: string;
}

const SETTING_COLUMNS = "key, value, label, description, is_public, updated_at";

/** Every setting, public and private, ordered by key so the list is stable. */
export async function listAllSiteSettings(): Promise<AdminSiteSettingRow[]> {
  const { data, error } = await createAdminClient()
    .from("site_settings")
    .select(SETTING_COLUMNS)
    .order("key");

  if (error) throw new Error(`Failed to load site settings: ${error.message}`);
  return (data ?? []) as unknown as AdminSiteSettingRow[];
}

export async function getSiteSetting(key: string): Promise<AdminSiteSettingRow | null> {
  const { data, error } = await createAdminClient()
    .from("site_settings")
    .select(SETTING_COLUMNS)
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(`Failed to load site setting ${key}: ${error.message}`);
  return (data as unknown as AdminSiteSettingRow) ?? null;
}

/**
 * Replace one setting's JSONB value.
 *
 * Deliberately an UPDATE and not an upsert: every key this admin screen edits
 * was created by a migration that also wrote its `label`, `description` and
 * `is_public`. An upsert would let a typo in the key field create a new,
 * unlabelled, private row that no storefront reader ever looks at — a setting
 * that looks saved and changes nothing.
 */
export async function updateSiteSettingValue(
  key: string,
  value: unknown,
  updatedBy: string,
): Promise<AdminSiteSettingRow | null> {
  const { data, error } = await createAdminClient()
    .from("site_settings")
    .update({ value, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("key", key)
    .select(SETTING_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update site setting ${key}: ${error.message}`);
  return (data as unknown as AdminSiteSettingRow) ?? null;
}

// ── site_content ─────────────────────────────────────────────────────────────

export interface AdminSiteContentRow {
  id: string;
  kind: string;
  slug: string;
  locale: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
}

const CONTENT_COLUMNS =
  "id, kind, slug, locale, title, body, data, sort_order, is_published, updated_at";

/**
 * Every block, INCLUDING the unpublished ones — the whole point of the admin
 * view. Ordered kind-then-position so the screen can group without a second
 * pass.
 */
export async function listAllSiteContent(): Promise<AdminSiteContentRow[]> {
  const { data, error } = await createAdminClient()
    .from("site_content")
    .select(CONTENT_COLUMNS)
    .order("kind")
    .order("sort_order");

  if (error) throw new Error(`Failed to load site content: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as AdminSiteContentRow),
    data:
      row.data != null && typeof row.data === "object"
        ? (row.data as Record<string, unknown>)
        : {},
  }));
}

export interface SiteContentPatch {
  title?: string | null;
  body?: string | null;
  sort_order?: number;
  is_published?: boolean;
}

export async function updateSiteContentRow(
  id: string,
  patch: SiteContentPatch,
  updatedBy: string,
): Promise<AdminSiteContentRow | null> {
  const { data, error } = await createAdminClient()
    .from("site_content")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("id", id)
    .select(CONTENT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update site content: ${error.message}`);
  return (data as unknown as AdminSiteContentRow) ?? null;
}

// ── regions ──────────────────────────────────────────────────────────────────

export interface AdminRegionRow {
  code: string;
  name: string;
  status: "live" | "soon" | "off";
  hub_city: string | null;
  transit_days_min: number | null;
  transit_days_max: number | null;
  store_names: string[];
  blurb: string | null;
  sort_order: number;
  updated_at: string;
}

const REGION_COLUMNS =
  "code, name, status, hub_city, transit_days_min, transit_days_max, store_names, blurb, sort_order, updated_at";

/**
 * Every lane. `listRegions` in `regions.ts` returns the same rows today, but
 * through the anon client and with the storefront's column set; this one is the
 * admin's and is free to widen without changing what a visitor can read.
 */
export async function listAllRegions(): Promise<AdminRegionRow[]> {
  const { data, error } = await createAdminClient()
    .from("regions")
    .select(REGION_COLUMNS)
    .order("sort_order");

  if (error) throw new Error(`Failed to load regions: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as AdminRegionRow),
    store_names: Array.isArray(row.store_names) ? row.store_names.map(String) : [],
  }));
}

export async function getRegion(code: string): Promise<AdminRegionRow | null> {
  const { data, error } = await createAdminClient()
    .from("regions")
    .select(REGION_COLUMNS)
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(`Failed to load region ${code}: ${error.message}`);
  return (data as unknown as AdminRegionRow) ?? null;
}

export interface RegionPatch {
  status?: "live" | "soon" | "off";
  hub_city?: string | null;
  transit_days_min?: number | null;
  transit_days_max?: number | null;
  blurb?: string | null;
}

export async function updateRegion(
  code: string,
  patch: RegionPatch,
  updatedBy: string,
): Promise<AdminRegionRow | null> {
  const { data, error } = await createAdminClient()
    .from("regions")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("code", code)
    .select(REGION_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update region ${code}: ${error.message}`);
  return (data as unknown as AdminRegionRow) ?? null;
}

// ── delivery_zones ───────────────────────────────────────────────────────────

export interface AdminDeliveryZoneRow {
  id: string;
  name: string;
  kind: "door" | "pickup";
  /** GHS, charged once per checkout on the bag's chosen zone. Real money. */
  fee_ghs: number;
  extra_days: number;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
}

const ZONE_COLUMNS =
  "id, name, kind, fee_ghs, extra_days, note, is_active, sort_order, updated_at";

/** Every zone, including the deactivated ones the storefront never returns. */
export async function listAllDeliveryZones(): Promise<AdminDeliveryZoneRow[]> {
  const { data, error } = await createAdminClient()
    .from("delivery_zones")
    .select(ZONE_COLUMNS)
    .order("sort_order");

  if (error) throw new Error(`Failed to load delivery zones: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as AdminDeliveryZoneRow),
    fee_ghs: Number(row.fee_ghs),
    extra_days: Number(row.extra_days),
  }));
}

export async function getDeliveryZone(id: string): Promise<AdminDeliveryZoneRow | null> {
  const { data, error } = await createAdminClient()
    .from("delivery_zones")
    .select(ZONE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load delivery zone: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    ...(row as unknown as AdminDeliveryZoneRow),
    fee_ghs: Number(row.fee_ghs),
    extra_days: Number(row.extra_days),
  };
}

export interface DeliveryZonePatch {
  fee_ghs?: number;
  extra_days?: number;
  note?: string | null;
  is_active?: boolean;
}

export async function updateDeliveryZone(
  id: string,
  patch: DeliveryZonePatch,
  updatedBy: string,
): Promise<AdminDeliveryZoneRow | null> {
  const { data, error } = await createAdminClient()
    .from("delivery_zones")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("id", id)
    .select(ZONE_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update delivery zone: ${error.message}`);
  return (data as unknown as AdminDeliveryZoneRow) ?? null;
}

// ── waitlist_signups ─────────────────────────────────────────────────────────

export interface AdminWaitlistRow {
  id: string;
  email: string;
  phone: string | null;
  region_code: string;
  created_at: string;
  notified_at: string | null;
}

/**
 * The people waiting for a lane that is not live yet, newest first.
 *
 * Capped rather than paginated: this list is read to answer "is there enough
 * demand to open the UK lane", and a few hundred rows answers that. The count
 * beside it is exact and comes from `countWaitlistSignups`, so a capped list
 * never misrepresents the total.
 */
export async function listWaitlistSignups(limit = 200): Promise<AdminWaitlistRow[]> {
  const { data, error } = await createAdminClient()
    .from("waitlist_signups")
    .select("id, email, phone, region_code, created_at, notified_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load waitlist signups: ${error.message}`);
  return (data ?? []) as unknown as AdminWaitlistRow[];
}

/** Exact total, so a capped list can say how much of the whole it is showing. */
export async function countWaitlistSignups(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("waitlist_signups")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to count waitlist signups: ${error.message}`);
  return count ?? 0;
}

// ── media_overrides ──────────────────────────────────────────────────────────

export interface AdminMediaOverrideRow {
  key: string;
  src: string | null;
  alt: string | null;
  position: string | null;
  width: number | null;
  height: number | null;
  storage_path: string | null;
  updated_at: string;
}

/**
 * Which marketing images have been overridden away from the shipped manifest.
 *
 * Read-only here. Writes belong to the in-page builder
 * (`/api/admin/builder/[key]`), which owns upload, crop and reset and does the
 * storage work an override implies — a second write path would let this screen
 * orphan a file in the `marketing-media` bucket.
 */
export async function listMediaOverrides(): Promise<AdminMediaOverrideRow[]> {
  const { data, error } = await createAdminClient()
    .from("media_overrides")
    .select("key, src, alt, position, width, height, storage_path, updated_at")
    .order("key");

  if (error) throw new Error(`Failed to load media overrides: ${error.message}`);
  return (data ?? []) as unknown as AdminMediaOverrideRow[];
}
