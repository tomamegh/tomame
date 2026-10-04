import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import type { CreateBannerInput, UpdateBannerInput } from "@/features/banners/schema";
import type { BannerPlacement, LiveBanner, SiteBanner } from "@/features/banners/types";

// Data access only. Live reads go through the cookieless anon client so the
// 089 RLS policy (active + inside the window) is what decides; admin reads and
// every write are the service role's.

const COLUMNS =
  "id, placement, tone, title, body, link_label, link_url, is_active, dismissible, starts_at, ends_at, sort_order, created_at, updated_at";
const LIVE_COLUMNS = "id, tone, title, body, link_label, link_url, dismissible, updated_at";

export async function listLiveBanners(placement: BannerPlacement): Promise<LiveBanner[]> {
  const { data, error } = await createPublicClient()
    .from("site_banners")
    .select(LIVE_COLUMNS)
    .eq("placement", placement)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(`Failed to load banners: ${error.message}`);
  return (data ?? []) as LiveBanner[];
}

export async function listAllBanners(): Promise<SiteBanner[]> {
  const { data, error } = await createAdminClient()
    .from("site_banners")
    .select(COLUMNS)
    .order("placement")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(`Failed to load banners: ${error.message}`);
  return (data ?? []) as SiteBanner[];
}

export async function getBannerById(id: string): Promise<SiteBanner | null> {
  const { data, error } = await createAdminClient().from("site_banners").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load banner: ${error.message}`);
  return (data as SiteBanner | null) ?? null;
}

export async function insertBanner(input: CreateBannerInput, actorId: string): Promise<SiteBanner> {
  const { data, error } = await createAdminClient()
    .from("site_banners")
    .insert({ ...input, updated_by: actorId })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to save banner: ${error.message}`);
  return data as SiteBanner;
}

export async function updateBanner(id: string, patch: UpdateBannerInput, actorId: string): Promise<SiteBanner | null> {
  const row = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { data, error } = await createAdminClient()
    .from("site_banners")
    .update({ ...row, updated_by: actorId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update banner: ${error.message}`);
  return (data as SiteBanner | null) ?? null;
}

export async function deleteBanner(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("site_banners").delete().eq("id", id).select("id");
  if (error) throw new Error(`Failed to delete banner: ${error.message}`);
  return (data ?? []).length > 0;
}
