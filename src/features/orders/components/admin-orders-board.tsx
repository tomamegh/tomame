import Link from "next/link";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTableScroller,
} from "@/components/layout/admin/admin-page";
import type { AdminOrderRow } from "@/db/queries/admin-orders";
import { cn } from "@/lib/utils";
import {
  formatAdminDate,
  orderEtaDisplay,
  orderTotalDisplay,
} from "./admin-order-display";
import { adminStatusLabel, adminStatusTone } from "./admin-transitions";

/**
 * The orders table.
 *
 * A SERVER COMPONENT. The old one was a client island that fetched
 * `/api/admin/orders` with react-query, held its own sort and filter state, and
 * computed the four stat figures in the browser by pulling every order and
 * measuring the array. All of that is now a single server render against
 * `db/queries/admin-orders.ts`, and the filters live in the URL — so a link to
 * "orders needing review" is a link an admin can actually send to somebody.
 *
 * Every column is a stored fact. Nothing here derives a status, a total or a
 * date; `admin-order-display.ts` chooses between figures already on the row and
 * `journey-stage.ts` supplies the word for a status, so the admin reads the same
 * vocabulary the customer does.
 */

export interface AdminOrdersBoardProps {
  orders: AdminOrderRow[];
  /** Echoed back into the empty state so it can say what was being looked for. */
  filterSummary: string | null;
  /** True when the list was cut off at the page size, so the card can say so. */
  truncated: boolean;
}

export function AdminOrdersBoard({ orders, filterSummary, truncated }: AdminOrdersBoardProps) {
  if (orders.length === 0) {
    return (
      <AdminCard index={1}>
        <AdminEmpty
          title="Nothing here"
          body={
            filterSummary
              ? `No order matches ${filterSummary}. Clear the filter to see the rest.`
              : "No orders have been placed yet. The first one a customer pays for will appear here."
          }
        >
          {filterSummary ? (
            <Link
              href="/admin/orders"
              className="mt-1 text-[13px] font-semibold text-tm-coral-strong hover:underline"
            >
              Show every order
            </Link>
          ) : null}
        </AdminEmpty>
      </AdminCard>
    );
  }

  return (
    <AdminCard
      index={1}
      flush
      title="Orders"
      blurb={
        truncated
          ? `Showing the ${orders.length} most recent. Narrow the filter or search to reach older ones.`
          : `${orders.length} ${orders.length === 1 ? "order" : "orders"}.`
      }
    >
      <AdminTableScroller>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={ADMIN_TH} scope="col">
                Order
              </th>
              <th className={ADMIN_TH} scope="col">
                Customer
              </th>
              <th className={ADMIN_TH} scope="col">
                Status
              </th>
              <th className={cn(ADMIN_TH, "text-right")} scope="col">
                Total
              </th>
              <th className={ADMIN_TH} scope="col">
                Delivery window
              </th>
              <th className={ADMIN_TH} scope="col">
                Placed
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </tbody>
        </table>
      </AdminTableScroller>
    </AdminCard>
  );
}

function OrderRow({ order }: { order: AdminOrderRow }) {
  const total = orderTotalDisplay(order);
  const eta = orderEtaDisplay(order);
  const placed = formatAdminDate(order.created_at);

  return (
    <tr className={ADMIN_TR}>
      <td className={ADMIN_TD}>
        <Link
          href={`/admin/orders/${order.id}`}
          className="flex flex-col gap-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral"
        >
          <span className="tm-nums text-[13px] leading-none font-bold text-tm-ink">
            {order.order_no}
          </span>
          <span className="line-clamp-1 max-w-[34ch] text-[12px] leading-[1.35] font-medium text-tm-text-2">
            {order.product_name}
          </span>
        </Link>
      </td>
      <td className={ADMIN_TD}>
        <span className="text-[13px] font-medium text-tm-text-2">
          {order.customer_name ?? "—"}
        </span>
      </td>
      <td className={ADMIN_TD}>
        <div className="flex flex-wrap items-center gap-1.5">
          <AdminBadge tone={adminStatusTone(order.status)}>
            {adminStatusLabel(order.status)}
          </AdminBadge>
          {/*
            Amber, because a flagged order is waiting on a PERSON — an admin has
            to price or approve it before the customer can pay. That is exactly
            what the tone means across this console.
          */}
          {order.needs_review ? <AdminBadge tone="amber">Needs review</AdminBadge> : null}
        </div>
      </td>
      <td className={cn(ADMIN_TD, "text-right")}>
        <span
          className={cn(
            "tm-nums text-[13px] font-semibold",
            total.isUnpriced ? "text-tm-amber" : "text-tm-ink",
          )}
        >
          {total.text}
        </span>
        {total.isOverride ? (
          <span className="block text-[11px] leading-none font-medium text-tm-text-3">
            Set by hand
          </span>
        ) : null}
      </td>
      <td className={ADMIN_TD}>
        <span className="tm-nums text-[13px] font-medium text-tm-text-2">{eta ?? "—"}</span>
      </td>
      <td className={ADMIN_TD}>
        <span className="tm-nums text-[13px] font-medium text-tm-text-3">{placed ?? "—"}</span>
      </td>
    </tr>
  );
}
