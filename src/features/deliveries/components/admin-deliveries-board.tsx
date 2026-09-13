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
import type { AdminDeliveryRow } from "@/db/queries/admin-deliveries";
import {
  formatAdminDate,
  orderEtaDisplay,
} from "@/features/orders/components/admin-order-display";
import {
  adminStatusLabel,
  adminStatusTone,
} from "@/features/orders/components/admin-transitions";
import { cn } from "@/lib/utils";

/**
 * The delivery pipeline as a table.
 *
 * A server component reading `db/queries/admin-deliveries.ts`. What it shows is
 * deliberately narrower than the orders table: this screen answers "what is
 * moving, and what is stuck", so the columns are the carrier, the tracking
 * number, the window and the zone — not the money, which is the orders screen's
 * business.
 *
 * TWO HONESTIES ARE LOAD-BEARING HERE.
 *
 * 1. An order with no `order_deliveries` row says so rather than showing empty
 *    cells. Every upsert into that table failed silently until migration 050
 *    added the unique index `ON CONFLICT` needed, so a blank tracking column is
 *    usually a missing ROW, not a missing carrier — and an admin chasing a
 *    parcel needs to know which.
 * 2. An `in_transit` order with no tracking number is flagged amber, because
 *    that is a person's job left undone: the customer has been told it shipped
 *    and has nothing to follow.
 */

export function AdminDeliveriesBoard({
  deliveries,
  filterSummary,
  truncated,
}: {
  deliveries: AdminDeliveryRow[];
  filterSummary: string | null;
  truncated: boolean;
}) {
  if (deliveries.length === 0) {
    return (
      <AdminCard index={1}>
        <AdminEmpty
          title="Nothing in the pipeline"
          body={
            filterSummary
              ? `No delivery matches ${filterSummary}. Clear the filter to see the rest.`
              : "No order has been paid for and moved past payment yet. Deliveries appear here once a buyer starts sourcing one."
          }
        >
          {filterSummary ? (
            <Link
              href="/admin/deliveries"
              className="mt-1 text-[13px] font-semibold text-tm-coral-strong hover:underline"
            >
              Show the whole pipeline
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
      title="In the pipeline"
      blurb={
        truncated
          ? `Showing the ${deliveries.length} most recent. Narrow the filter to reach older ones.`
          : `${deliveries.length} ${deliveries.length === 1 ? "delivery" : "deliveries"}.`
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
                Stage
              </th>
              <th className={ADMIN_TH} scope="col">
                Carrier &amp; tracking
              </th>
              <th className={ADMIN_TH} scope="col">
                Delivery window
              </th>
              <th className={ADMIN_TH} scope="col">
                Going to
              </th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((row) => (
              <DeliveryRow key={row.order.id} row={row} />
            ))}
          </tbody>
        </table>
      </AdminTableScroller>
    </AdminCard>
  );
}

function DeliveryRow({ row }: { row: AdminDeliveryRow }) {
  const { order, record } = row;
  const eta = orderEtaDisplay(order);
  const untracked = order.status === "in_transit" && !order.tracking_number;

  return (
    <tr className={ADMIN_TR}>
      <td className={ADMIN_TD}>
        <Link href={`/admin/orders/${order.id}`} className="flex flex-col gap-0.5">
          <span className="tm-nums text-[13px] leading-none font-bold text-tm-ink">
            {order.order_no}
          </span>
          <span className="line-clamp-1 max-w-[30ch] text-[12px] leading-[1.35] font-medium text-tm-text-2">
            {order.product_name}
          </span>
        </Link>
      </td>
      <td className={ADMIN_TD}>
        <span className="text-[13px] font-medium text-tm-text-2">
          {row.customer_name ?? "—"}
        </span>
      </td>
      <td className={ADMIN_TD}>
        <div className="flex flex-col items-start gap-1">
          <AdminBadge tone={adminStatusTone(order.status)}>
            {adminStatusLabel(order.status)}
          </AdminBadge>
          <span className="tm-nums text-[11px] leading-none font-medium text-tm-text-3">
            {formatAdminDate(order.created_at) ?? ""}
          </span>
        </div>
      </td>
      <td className={ADMIN_TD}>
        {order.carrier || order.tracking_number ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[12.5px] font-semibold text-tm-ink">
              {order.carrier ?? "Carrier not named"}
            </span>
            {record?.tracking_url && order.tracking_number ? (
              <a
                href={record.tracking_url}
                target="_blank"
                rel="noreferrer noopener"
                className="tm-nums text-[12px] font-medium text-tm-coral-strong hover:underline"
              >
                {order.tracking_number}
              </a>
            ) : (
              <span className="tm-nums text-[12px] font-medium text-tm-text-2">
                {order.tracking_number ?? "No number"}
              </span>
            )}
          </div>
        ) : (
          <AdminBadge tone={untracked ? "amber" : "muted"}>
            {untracked ? "Shipped with no tracking" : "Not shipped yet"}
          </AdminBadge>
        )}
      </td>
      <td className={ADMIN_TD}>
        <span className={cn("tm-nums text-[12.5px] font-medium", eta ? "text-tm-ink" : "text-tm-text-3")}>
          {eta ?? "Not set"}
        </span>
      </td>
      <td className={ADMIN_TD}>
        {row.zone_name ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[12.5px] font-medium text-tm-ink">{row.zone_name}</span>
            <span className="text-[11px] leading-none font-medium text-tm-text-3">
              {row.zone_kind === "pickup" ? "Pickup point" : "To the door"}
            </span>
          </div>
        ) : (
          // No zone means no checkout group — the order predates the bag, so
          // nothing recorded where it was going. Said rather than left blank.
          <span className="text-[12px] font-medium text-tm-text-3">Not recorded</span>
        )}
      </td>
    </tr>
  );
}
