import type { LucideIcon } from "lucide-react";
import {
  HandCoinsIcon,
  ActivityIcon,
  BellIcon,
  BookmarkIcon,
  CameraIcon,
  CreditCardIcon,
  FileTextIcon,
  LayoutGridIcon,
  LinkIcon,
  MailIcon,
  MessageCircleIcon,
  PackageIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SlidersHorizontalIcon,
  TruckIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { AdminQueueCounts } from "@/db/queries/admin-queues";

/**
 * The admin's destinations, as data.
 *
 * Pure and framework free so the active-route resolver can be unit tested
 * without a DOM — the same split `components/layout/app/links.ts` uses for the
 * storefront nav.
 *
 * WHAT CHANGED. The old list had nine entries and stopped at the features that
 * existed before the v2 work: there was no way to see a customer's bag, the
 * paste queue, the price watches, or any of the marketing content an admin is
 * supposed to own — all of those shipped with a table and a customer-facing
 * screen and no administration at all. It also carried two dead links
 * ("Support" and "Feedback", both `href="#"`), which are the same class of bug
 * as the `/blog` and `/careers` entries just removed from the marketing footer.
 */

export interface AdminNavLink {
  title: string;
  url: string;
  icon: LucideIcon;
  /**
   * Which queue count to badge this entry with, when there is one.
   *
   * A badge means "a person owes somebody an action here". It is deliberately
   * NOT put on Orders-in-flight or Transactions: those are large and always
   * non-zero, and a badge that is never zero is furniture, not a signal.
   */
  badge?: keyof AdminQueueCounts;
}

export interface AdminNavGroup {
  label?: string;
  links: AdminNavLink[];
}

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    links: [{ title: "Dashboard", url: "/admin", icon: LayoutGridIcon }],
  },
  {
    label: "Operations",
    links: [
      { title: "Orders", url: "/admin/orders", icon: ShoppingCartIcon, badge: "ordersNeedingReview" },
      { title: "Bags", url: "/admin/bags", icon: ShoppingBagIcon },
      { title: "Boxes", url: "/admin/boxes", icon: PackageIcon },
      { title: "Deliveries", url: "/admin/deliveries", icon: TruckIcon },
    ],
  },
  {
    label: "Requests",
    links: [
      { title: "Assisted", url: "/admin/assisted-requests", icon: MessageCircleIcon, badge: "assistedOpen" },
      // Blocking in a way the others are not: every open row is a bag that
      // cannot be paid for until a buyer prices it.
      { title: "Sourcing", url: "/admin/sourcing-requests", icon: HandCoinsIcon, badge: "sourcingOpen" },
      { title: "Messages", url: "/admin/contact-messages", icon: MailIcon, badge: "contactOpen" },
      // A customer looking at the photograph of their own parcel, still on a
      // shelf in America. The badge counts only `open` rows, so it disappears
      // the moment the queue is worked — which is the point: a badge that never
      // goes out is furniture.
      { title: "Parcel feedback", url: "/admin/feedback", icon: CameraIcon, badge: "feedbackOpen" },
      { title: "Paste queue", url: "/admin/pastes", icon: LinkIcon, badge: "pastesFailed" },
    ],
  },
  {
    label: "Money",
    links: [
      { title: "Transactions", url: "/admin/transactions", icon: CreditCardIcon },
      { title: "Pricing & rates", url: "/admin/settings", icon: SlidersHorizontalIcon },
    ],
  },
  {
    label: "Catalogue",
    links: [
      { title: "Price watches", url: "/admin/watches", icon: BookmarkIcon },
      { title: "Content", url: "/admin/content", icon: FileTextIcon },
      { title: "Policies", url: "/admin/policies", icon: FileTextIcon },
    ],
  },
  {
    label: "System",
    links: [
      { title: "Users", url: "/admin/users", icon: UsersRoundIcon },
      { title: "Notifications", url: "/admin/notifications", icon: BellIcon },
      // Absence detection: jobs, payments and messages that have gone quiet.
      { title: "Health", url: "/admin/ops", icon: ActivityIcon },
    ],
  },
] as const;

/**
 * Is this nav entry the one the current route belongs to?
 *
 * MOST SPECIFIC WINS, and `/admin` is exact-only. Every admin route is a prefix
 * match against `/admin`, so without the depth rule the Dashboard entry lights
 * up on all fifteen screens at once. Deeper entries prefix-match so that
 * `/admin/orders/<id>` keeps Orders lit.
 */
export function isAdminNavActive(pathname: string | null, url: string): boolean {
  if (!pathname) return false;
  const path = stripTrailingSlash(pathname);
  if (path === url) return true;
  const depth = url.split("/").filter(Boolean).length;
  return depth >= 2 && path.startsWith(`${url}/`);
}

/** Which entry owns the current route, across every group. Null outside the nav. */
export function resolveActiveAdminNav(
  pathname: string | null,
  groups: readonly AdminNavGroup[] = ADMIN_NAV,
): AdminNavLink | null {
  const all = groups.flatMap((group) => group.links);
  // Longest href first, so `/admin/orders/new` cannot be claimed by
  // `/admin/orders` when both would match.
  const match = [...all]
    .sort((a, b) => b.url.length - a.url.length)
    .find((link) => isAdminNavActive(pathname, link.url));
  return match ?? null;
}

/**
 * What a badge should read, or null when there is nothing waiting.
 *
 * Null at zero rather than "0": an empty queue is good news and the right way to
 * show it is to show nothing. Capped at 99+ so a long-neglected queue cannot
 * widen the sidebar.
 */
export function formatNavBadge(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count <= 0) return null;
  const n = Math.floor(count);
  return n > 99 ? "99+" : String(n);
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
