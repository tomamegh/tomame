/**
 * Who is looking at a quote. Built by the route handler from the session
 * (`userId`) and the server-minted `tm_quote_session` cookie (`sessionId`) —
 * never from the request body. Both may be present right after sign-in, which
 * is when anonymous locks are adopted; both null should not happen and prices
 * live without a lock.
 */
export interface Viewer {
  userId: string | null;
  sessionId: string | null;
}

/** The three admin constants the quote flow reads, all from `pricing_constants`. */
export interface QuoteConstants {
  rate_lock_hours: number;
  purchase_lead_days_min: number;
  purchase_lead_days_max: number;
}

/** Inclusive calendar window, YYYY-MM-DD. */
export interface DeliveryWindow {
  from: string;
  to: string;
}

/**
 * One assurance card under the receipt, built from a `quote_assurance`
 * `site_content` row. `icon` is a Phosphor glyph NAME and is resolved through
 * an explicit map in the component — never used to look up a component from
 * the database directly.
 */
export interface QuoteAssurance {
  slug: string;
  title: string;
  /** The card's subline, e.g. "until we buy it". */
  body: string | null;
  /** Phosphor glyph name from `data.icon`, or null when the row omits it. */
  icon: string | null;
  /** The policy this card summarises, from `data.href`. */
  href: string | null;
}
