/**
 * Admin-written banners (migration 089). `placement` names a slot the app
 * renders; the list is closed and matches 089's CHECK.
 */
export const BANNER_PLACEMENTS = ["checkout", "app_home", "buy", "cars"] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const BANNER_TONES = ["info", "warning", "success", "promo"] as const;
export type BannerTone = (typeof BANNER_TONES)[number];

/** Where each slot appears, in the admin's words. */
export const PLACEMENT_LABELS: Record<BannerPlacement, { label: string; where: string }> = {
  checkout: { label: "Checkout", where: "The bag, beside the order summary and Pay button" },
  app_home: { label: "Home", where: "The top of the signed-in home screen" },
  buy: { label: "Buy for me", where: "Above the paste-a-link screen" },
  cars: { label: "Cars", where: "The top of the cars page" },
};

export const TONE_LABELS: Record<BannerTone, string> = {
  info: "Information",
  warning: "Heads-up",
  success: "Good news",
  promo: "Promotion",
};

export interface SiteBanner {
  id: string;
  placement: BannerPlacement;
  tone: BannerTone;
  title: string;
  body: string | null;
  link_label: string | null;
  link_url: string | null;
  is_active: boolean;
  dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** What a customer's page needs — no admin bookkeeping. */
export type LiveBanner = Pick<SiteBanner, "id" | "tone" | "title" | "body" | "link_label" | "link_url" | "dismissible" | "updated_at">;

/** Where a banner stands right now, for the admin list. */
export type BannerStatus = "live" | "scheduled" | "ended" | "off";

export function bannerStatus(banner: Pick<SiteBanner, "is_active" | "starts_at" | "ends_at">, now: Date): BannerStatus {
  if (!banner.is_active) return "off";
  if (banner.starts_at && new Date(banner.starts_at) > now) return "scheduled";
  if (banner.ends_at && new Date(banner.ends_at) <= now) return "ended";
  return "live";
}
