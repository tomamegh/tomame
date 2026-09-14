import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { AdminBadge, AdminPage } from "@/components/layout/admin/admin-page";
import {
  getAdminOrder,
  getOrderCustomer,
  getOrderPayment,
  listOrderAuditLogs,
  listSiblingOrders,
} from "@/db/queries/admin-orders";
import { getDeliveryRecord } from "@/db/queries/admin-deliveries";
import { listOrderEvents } from "@/db/queries/order-events";
import { getOrderGroupById } from "@/db/queries/order-groups";
import { AdminOrderParcelPanel } from "@/features/order-photos/components/admin-parcel-panel";
import { AdminOrderDetail } from "@/features/orders/components/admin-order-detail";
import { AdminOrderOps } from "@/features/orders/components/admin-order-ops";
import { AdminOrderReviewPanel } from "@/features/orders/components/admin-order-review-panel";
import {
  adminStatusLabel,
  adminStatusTone,
} from "@/features/orders/components/admin-transitions";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Order · Tomame admin" };

/**
 * One order, with everything an admin needs to do their job on it.
 *
 * A server component: it reads the order and its six satellites in one pass and
 * hands them to presentation components, rather than the previous screen's three
 * client-side react-query hooks. `/admin` is gated by `src/proxy.ts`, and every
 * read below runs under the service role, which is only reachable from the
 * server — a client component importing `createAdminClient` would not build.
 *
 * The two mutating panels are client islands and both call `router.refresh()`
 * on success, so what an admin sees after a change is what the database
 * actually stored, not an optimistic guess at it.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await getAdminOrder(id);
  if (!order) notFound();

  // Six independent reads; none of them depends on another's result, so they go
  // out together rather than in a waterfall six round trips deep.
  const [customer, payment, delivery, group, siblings, events, auditLogs] = await Promise.all([
    getOrderCustomer(order.user_id),
    getOrderPayment(order),
    getDeliveryRecord(order.id),
    order.order_group_id ? getOrderGroupById(order.order_group_id) : Promise.resolve(null),
    order.order_group_id
      ? listSiblingOrders(order.order_group_id, order.id)
      : Promise.resolve([]),
    // `customerVisibleOnly: false` — an admin sees the internal notes too, which
    // is the whole reason that column exists.
    listOrderEvents(createAdminClient(), order.id, { customerVisibleOnly: false }),
    listOrderAuditLogs(order.id),
  ]);

  return (
    <AdminPage
      title={order.order_no}
      blurb={order.product_name}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge tone={adminStatusTone(order.status)}>
            {adminStatusLabel(order.status)}
          </AdminBadge>
          {order.needs_review ? <AdminBadge tone="amber">Needs review</AdminBadge> : null}
          <Link
            href="/admin/orders"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border px-3.5 text-[12.5px] font-semibold text-tm-text-2 transition-colors hover:border-tm-coral/30 hover:text-tm-ink"
          >
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            All orders
          </Link>
        </div>
      }
    >
      {/*
        The review decision comes first when there is one to make: an order in
        that state cannot move through the pipeline at all, and `transitionsFor`
        withholds every other control until it is resolved.
      */}
      {order.needs_review ? <AdminOrderReviewPanel order={order} index={0} /> : null}

      <AdminOrderOps
        order={order}
        hasSuccessfulPayment={payment?.status === "success"}
        index={order.needs_review ? 1 : 0}
      />

      {/*
        The camera, and the customer's answer to it. Above the detail grid on
        purpose: when there is a parcel on a shelf, photographing it is the job,
        and burying the control under the receipt is how it goes unfound.
      */}
      <AdminOrderParcelPanel
        orderId={order.id}
        status={order.status}
        index={order.needs_review ? 2 : 1}
      />

      <AdminOrderDetail
        order={order}
        customer={customer}
        payment={payment}
        delivery={delivery}
        group={group}
        siblings={siblings}
        events={events}
        auditLogs={auditLogs}
      />
    </AdminPage>
  );
}
