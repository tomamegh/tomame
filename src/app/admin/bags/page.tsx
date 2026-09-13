import type { Metadata } from "next";

import { AdminPage, AdminStat } from "@/components/layout/admin/admin-page";
import { listAdminBags, type AdminBagFilters } from "@/db/queries/admin-bags";
import type { CartStatus } from "@/db/queries/carts";
import {
  BAG_STALE_AFTER_HOURS,
  summariseBags,
} from "@/features/bag/components/admin-bag-format";
import { AdminBagsBoard } from "@/features/bag/components/admin-bags-board";
import {
  AdminFilterPills,
  type AdminFilterPill,
} from "@/features/orders/components/admin-filter-pills";
import { formatGhs } from "@/features/marketing/format";

export const metadata: Metadata = { title: "Bags · Tomame admin" };

/**
 * `/admin/bags` — what customers are putting in their bags right now.
 *
 * NEW IN THIS PASS. Migration 048 shipped carts, cart lines and checkout groups
 * with a full customer surface and no administration whatsoever, so the earliest
 * and cheapest demand signal the business has — what people price but do not buy
 * — was visible to nobody.
 *
 * Two things this screen is careful about:
 *
 * - **The value is a snapshot.** It sums `cart_items.pricing`, the breakdown
 *   stored at add-to-bag time, and never re-prices. `getBag` (the customer's
 *   read) re-prices every line on every call under the viewer's rate lock, which
 *   is far too expensive for a list and would also mean an admin page moving the
 *   FX rate cache around. The card says which figure it is showing.
 * - **Blocked means a person is stuck.** A line still being read, one the
 *   extractor gave up on, one whose listing carried no price, or one whose quote
 *   has expired — each of those stops a bag being paid for, and each is amber
 *   because it is waiting on someone.
 */
export default async function AdminBagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = resolveStatus(params.status);

  const bags = await listAdminBags({ status } satisfies AdminBagFilters);
  // One clock for the whole render: rows computed against `Date.now()`
  // individually can straddle a minute boundary and disagree with the tile above
  // them about how many bags are stale.
  const now = new Date();
  const totals = summariseBags(bags, now);

  const pills: AdminFilterPill[] = STATUSES.map((option) => ({
    label: option.label,
    href: option.value === "open" ? "/admin/bags" : `/admin/bags?status=${option.value}`,
    active: status === option.value,
  }));

  return (
    <AdminPage
      title="Bags"
      blurb="What customers have put in a bag and not yet paid for — the earliest read the business gets on demand."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label={STATUS_LABEL[status]}
          value={String(totals.count)}
          detail={`${totals.itemCount} ${totals.itemCount === 1 ? "item" : "items"} across them`}
          tone={totals.count > 0 ? "coral" : "muted"}
        />
        <AdminStat
          index={1}
          label="Snapshot value"
          value={formatGhs(totals.snapshotValueGhs)}
          detail="Priced at add-to-bag time, not re-quoted"
          tone="neutral"
        />
        <AdminStat
          index={2}
          label="Blocked"
          value={String(totals.blocked)}
          detail={
            totals.blocked > 0
              ? "Holding a line that cannot be paid for"
              : "Every bag could check out today"
          }
          tone={totals.blocked > 0 ? "amber" : "green"}
        />
        <AdminStat
          index={3}
          label="Sitting"
          value={String(totals.stale)}
          detail={`Untouched for over ${BAG_STALE_AFTER_HOURS} hours`}
          tone={totals.stale > 0 ? "amber" : "muted"}
        />
      </div>

      <AdminFilterPills pills={pills} label="Filter bags by state" />

      <AdminBagsBoard bags={bags} now={now} emptyBody={EMPTY_BODY[status]} />
    </AdminPage>
  );
}

/**
 * The four `carts.status` values, in the order an admin cares about them.
 *
 * `merged` is included even though it is uninteresting on its own: it is where
 * an anonymous bag goes when its owner signs in and already had one, and being
 * able to see those rows is how you tell "the merge works" from "the merge is
 * silently dropping bags".
 */
const STATUSES = [
  { value: "open" as const, label: "Open" },
  { value: "checked_out" as const, label: "Checked out" },
  { value: "abandoned" as const, label: "Abandoned" },
  { value: "merged" as const, label: "Merged on sign-in" },
];

const STATUS_LABEL: Record<CartStatus, string> = {
  open: "Open bags",
  checked_out: "Checked out",
  abandoned: "Abandoned",
  merged: "Merged",
};

const EMPTY_BODY: Record<CartStatus, string> = {
  open: "Nobody has an open bag with anything in it right now. One appears here the moment a customer adds a line.",
  checked_out: "No bag has been checked out yet. A bag moves here when its customer pays.",
  abandoned: "No bag has been marked abandoned.",
  merged: "No anonymous bag has been merged into a customer's own on sign-in.",
};

function resolveStatus(value: string | string[] | undefined): CartStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = STATUSES.find((option) => option.value === raw);
  // Anything unrecognised falls back to `open` rather than showing nothing: an
  // admin who hand-edits the URL should land on the useful view, not an error.
  return match?.value ?? "open";
}
