/**
 * Prop contracts for the shared marketing nav + footer.
 *
 * Both components are presentational: they never read the database. A server
 * component parent loads `site_settings` and `policies` and maps them onto the
 * shapes below, so the footer has no hardcoded phone number, address, payment
 * channel list, legal link set or copyright year.
 */

/** A single top-level marketing nav destination. */
export interface MarketingNavItem {
  /** Stable identifier — matches the `active` enum in design/TmMarketingNav.dc.html. */
  key: MarketingNavKey;
  label: string;
  href: string;
}

export type MarketingNavKey = "how" | "regions" | "fees" | "faq" | "about";

/** A link rendered in the footer. */
export interface MarketingLink {
  label: string;
  href: string;
  /** Opens in a new tab with `rel="noopener noreferrer"` (e.g. wa.me). */
  external?: boolean;
}

/** One titled column of footer links. */
export interface MarketingFooterColumn {
  /** Used as the visible heading and, slugified, as the nav landmark label. */
  heading: string;
  links: readonly MarketingLink[];
}

/**
 * The `site_settings` rows the footer needs, already unwrapped from jsonb.
 * Keys map 1:1 to `site_settings.key`: `whatsapp_number`, `support_hours`,
 * `company_address`, `payment_channels`.
 *
 * Every field is nullable: a missing row hides its block rather than showing a
 * placeholder.
 */
export interface MarketingSiteSettings {
  whatsappNumber: string | null;
  supportHours: string | null;
  companyAddress: string | null;
  paymentChannels: readonly string[];
}

/** The subset of a `policies` row the footer links to. */
export interface MarketingPolicyLink {
  slug: string;
  label: string;
}
