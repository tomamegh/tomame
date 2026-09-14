import type { Metadata } from "next";

import { AdminPage, AdminStat } from "@/components/layout/admin/admin-page";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  getAdminOrderCounts,
  listAdminOrders,
} from "@/db/queries/admin-orders";
import {
  AdminFilterPills,
  AdminSearchForm,
  type AdminFilterPill,
} from "@/components/layout/admin";
import { AdminOrdersBoard } from "@/features/orders/components/admin-orders-board";

export const metadata: Metadata = { title: "Orders · Tomame admin" };

/**
 * `/admin/orders` — every order, and the queue of the ones a person has to price.
 *
 * A server component. The filter is in the URL (`?status=`, `?review=1`, `?q=`),
 * so the sidebar's "needs review" badge can link straight at the queue it counts
 * and an admin can send a colleague a link to exactly what they are looking at.
 *
 * The four tiles are database counts (`head: true`), not the length of a fetched
 * array — the screen this replaced pulled every order into the browser to
 * measure it, which is affordable at fifty orders and not at fifty thousand.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = single(params.status);
  const review = single(params.review) === "1";
  const search = single(params.q);

  const [counts, orders] = await Promise.all([
    getAdminOrderCounts(),
    listAdminOrders({
      status,
      needsReview: review ? true : undefined,
      search,
    }),
  ]);

  const pills = buildPills({ status, review, search, counts });

  return (
    <AdminPage
      title="Orders"
      blurb="Every order in the system, and the queue of the ones waiting on a person to price them."
      action={
        <AdminSearchForm
          action="/admin/orders"
          defaultValue={search}
          placeholder="Order number or product"
          label="Search orders"
          hidden={{ status, review: review ? "1" : undefined }}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label="Needs review"
          value={String(counts.needsReview)}
          detail={
            counts.needsReview > 0
              ? "Waiting on an admin to set a price or approve"
              : "Nothing waiting on you"
          }
          tone={counts.needsReview > 0 ? "amber" : "green"}
          href="/admin/orders?review=1"
        />
        <AdminStat
          index={1}
          label="Awaiting payment"
          value={String(counts.byStatus.pending)}
          detail="Placed, not yet paid for"
          tone={counts.byStatus.pending > 0 ? "neutral" : "muted"}
          href="/admin/orders?status=pending"
        />
        <AdminStat
          index={2}
          label="In flight"
          value={String(
            counts.byStatus.paid + counts.byStatus.processing + counts.byStatus.in_transit,
          )}
          detail="Paid, being bought, or in the air"
          tone="coral"
          href="/admin/orders?status=in_transit"
        />
        <AdminStat
          index={3}
          label="Delivered"
          value={String(counts.byStatus.delivered + counts.byStatus.completed)}
          detail={`${counts.total} in total, all time`}
          tone="green"
          href="/admin/orders?status=delivered"
        />
      </div>

      <AdminFilterPills pills={pills} label="Filter orders by status" />

      <AdminOrdersBoard
        orders={orders}
        filterSummary={describeFilter({ status, review, search })}
        truncated={orders.length >= ADMIN_ORDERS_PAGE_SIZE}
      />
    </AdminPage>
  );
}

/**
 * The pills, with the counts the tiles already fetched.
 *
 * A count of zero is passed through as `0` and the pill component drops it —
 * "Cancelled 0" is furniture, and an empty status is better shown by the pill
 * simply not carrying a number.
 */
function buildPills({
  status,
  review,
  search,
  counts,
}: {
  status?: string;
  review: boolean;
  search?: string;
  counts: Awaited<ReturnType<typeof getAdminOrderCounts>>;
}): AdminFilterPill[] {
  // The search term survives a status change: an admin narrowing "airpods" to
  // "in the air" means both, and dropping the term on the click would be a
  // filter silently undoing itself.
  const href = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams(extra);
    if (search) query.set("q", search);
    const qs = query.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return [
    { label: "All", href: href(), active: !status && !review, count: counts.total },
    {
      label: "Needs review",
      href: href({ review: "1" }),
      active: review,
      count: counts.needsReview,
    },
    {
      label: "Awaiting payment",
      href: href({ status: "pending" }),
      active: status === "pending",
      count: counts.byStatus.pending,
    },
    {
      label: "Paid",
      href: href({ status: "paid" }),
      active: status === "paid",
      count: counts.byStatus.paid,
    },
    {
      label: "Being purchased",
      href: href({ status: "processing" }),
      active: status === "processing",
      count: counts.byStatus.processing,
    },
    {
      label: "In the air",
      href: href({ status: "in_transit" }),
      active: status === "in_transit",
      count: counts.byStatus.in_transit,
    },
    {
      label: "Delivered",
      href: href({ status: "delivered" }),
      active: status === "delivered",
      count: counts.byStatus.delivered,
    },
    {
      label: "Cancelled",
      href: href({ status: "cancelled" }),
      active: status === "cancelled",
      count: counts.byStatus.cancelled,
    },
  ];
}

/** What the empty state should say was being looked for. Null when nothing was. */
function describeFilter({
  status,
  review,
  search,
}: {
  status?: string;
  review: boolean;
  search?: string;
}): string | null {
  const parts: string[] = [];
  if (review) parts.push("the review queue");
  if (status) parts.push(`status “${status}”`);
  if (search) parts.push(`“${search}”`);
  return parts.length > 0 ? parts.join(" and ") : null;
}

/** A repeated query parameter is a URL somebody hand-edited; take the first. */
function single(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}
