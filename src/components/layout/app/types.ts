/**
 * Prop contracts for the signed-in app chrome (`TmNavLight` + the 390px bottom
 * tab bar).
 *
 * Both are presentational: they never read the database. The `/app` layout
 * resolves the session, the FX rate, the unread-notification count and the
 * customer's initial, then maps them onto the shapes below — mirroring the
 * marketing nav's rule that "the parent resolves the session, this component
 * never touches Supabase".
 */

/**
 * Stable identifiers — these match the `active` enum in
 * `design/TmNavLight.dc.html` exactly (`home | shop | ship | orders`), including
 * `ship`, which the mock uses for the Price watch tab. The names are kept as
 * the design authored them so the mock and the build stay diffable.
 */
export type AppNavKey = "home" | "shop" | "ship" | "orders";

/** One destination, rendered both as a desktop pill and a mobile tab. */
export interface AppNavItem {
  key: AppNavKey;
  /** Desktop pill label, e.g. "Buy for me". */
  label: string;
  /** Bottom-tab label at 390px, where the mock shortens it to "Buy". */
  mobileLabel: string;
  href: string;
  /** Key into `APP_NAV_ICONS`; resolved to a Phosphor component at render. */
  icon: AppNavIconName;
  /**
   * Match this route exactly, never as a prefix.
   *
   * Set on Home, whose href (`/app`) is a prefix of every other app route —
   * without it, `/app/account` and `/app/transactions` would light up the Home
   * tab even though neither belongs to it.
   */
  exact?: boolean;
}

/** Icon set used by the app chrome, named after the mock's `ph-*` classes. */
export type AppNavIconName = "house" | "storefront" | "bookmark" | "path";

/**
 * The live FX rate behind the nav pill ("$1 = GH₵14.43").
 *
 * `null` when the rate is genuinely unavailable — the pill then renders nothing
 * rather than a stale or invented number.
 */
export interface AppNavRate {
  base: string;
  appliedRate: number;
  fetchedAt: string | null;
}

/** Everything the app chrome needs, resolved server-side by the layout. */
export interface AppChromeData {
  /**
   * False on the public quote routes (`/app/orders/new`, `/app/orders/review`),
   * which `src/proxy.ts` deliberately leaves open to visitors. The bell and
   * avatar are replaced with a sign-in link in that case.
   */
  isAuthenticated: boolean;
  /** Customer's first name, for the avatar initial. Null when not set. */
  firstName: string | null;
  /** `count(*) from notifications where user_id = me and read_at is null`. */
  unreadCount: number;
  rate: AppNavRate | null;
}
