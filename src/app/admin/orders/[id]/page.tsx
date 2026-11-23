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
import { AdminCourierPanel } from "@/features/order-delivery/components/admin-courier-panel";
import { getAdminOrderCourier } from "@/features/order-delivery/services/courier.service";
import { AdminOrderParcelPanel } from "@/features/order-photos/components/admin-parcel-panel";
import { AdminOrderDetail } from "@/features/orders/components/admin-order-detail";
import { AdminOrderOps } from "@/features/orders/components/admin-order-ops";
import { AdminOrderReviewPanel } from "@/features/orders/components/admin-order-review-panel";
import {
  adminStatusLabel,
  adminStatusTone,
} from "@/features/orders/components/admin-transitions";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { OrderInboundPanel } from "@/features/warehouse/components/inbound";
import { listInboundForOrder } from "@/features/warehouse/services/inbound.service";
import { ItemStatusPanel } from "@/features/warehouse/components/item-status-panel";
import { getWarehouseItem } from "@/features/warehouse/services/warehouse.service";
import { getOrderShipment, getStageSettingsForStaff } from "@/features/warehouse/services/shipment.service";
import { listDriversForStaff } from "@/features/drivers/services/driver.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderWhatsAppState, listOrderWhatsAppSends } from "@/db/queries/order-whatsapp";
import { AdminWhatsAppPanel } from "@/features/notifications/components/admin-whatsapp-panel";
import { deliveryArea, manualWhatsAppEntries } from "@/features/notifications/manual-whatsapp";
import { logger } from "@/lib/logger";

export const metadata: Metadata = { title: "Order · Admin" };

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
  // From purchase on, the tracking steps (hub, flight, Accra, out for delivery) are
  // the warehouse's; they are loaded here too so an admin moves them from this page.
  const shipped = ["processing", "in_transit", "delivered", "completed"].includes(order.status);
  const viewerPromise = getAuthenticatedUser().catch(() => null);
  const [customer, payment, delivery, group, siblings, events, auditLogs, courier, inbound, whatsapp, tracking] = await Promise.all([
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
    getAdminOrderCourier(order.id),
    // Store parcels on their way to the hub (086). `/admin` is admin-gated by
    // the proxy, and an admin may use the warehouse, so this read is theirs.
    // A failed read shows no parcels rather than taking the order page down.
    viewerPromise
      .then((user) => (user ? listInboundForOrder(user, order.id) : []))
      .catch(() => []),
    // Phase 1 WhatsApp (104). A failed read hides the panel, never the page.
    Promise.all([getOrderWhatsAppState(order.id), listOrderWhatsAppSends(order.id)]).catch((error: unknown) => {
      logger.warn("admin order: WhatsApp state unavailable", { orderId: order.id, error: String(error) });
      return null;
    }),
    // The tracking step and its controls (098). A failed read hides the panel, never the page.
    shipped
      ? viewerPromise
          .then(async (viewer) => {
            if (!viewer) return null;
            const [item, shipment, settings, drivers] = await Promise.all([
              getWarehouseItem(viewer, order.id),
              getOrderShipment(viewer, order.id),
              getStageSettingsForStaff(viewer),
              listDriversForStaff(viewer),
            ]);
            return { item, shipment, settings, drivers };
          })
          .catch((error: unknown) => {
            logger.warn("admin order: tracking step unavailable", { orderId: order.id, error: String(error) });
            return null;
          })
      : Promise.resolve(null),
  ]);
  const whatsappEntries = whatsapp
    ? manualWhatsAppEntries({
        order,
        customer: { firstName: customer?.name ?? null, phone: customer?.phone ?? null },
        events,
        sends: whatsapp[1],
        area: deliveryArea(group?.delivery_address as Record<string, unknown> | null | undefined),
      })
    : null;
  // From purchase onwards the store's tracking belongs on this page too.
  const showInbound = order.status === "processing" || inbound.length > 0;

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
        purchasableSiblings={
          order.status === "paid"
            ? siblings
                .filter((s) => s.status === "paid" && !s.held_at && !s.needs_review)
                .map((s) => ({ id: s.id, order_no: s.order_no ?? null, title: s.extraction_metadata?.product?.title?.slice(0, 70) ?? null }))
            : []
        }
        index={order.needs_review ? 1 : 0}
      />

      {/*
        The camera, and the customer's answer to it. Above the detail grid on
        purpose: when there is a parcel on a shelf, photographing it is the job,
        and burying the control under the receipt is how it goes unfound.
      */}
      {/*
        The last mile. Renders only while the order is in transit, or afterwards
        when a rider was sent (read-only), so it never competes with the camera
        on a parcel still at the hub.
      */}
      {tracking ? (
        <ItemStatusPanel item={tracking.item} shipment={tracking.shipment} settings={tracking.settings} drivers={tracking.drivers} />
      ) : null}

      {showInbound ? (
        <OrderInboundPanel
          orderId={order.id}
          orderNo={order.order_no}
          parcels={inbound}
          canAdd={order.status === "processing"}
        />
      ) : null}

      <AdminCourierPanel
        orderId={order.id}
        status={order.status}
        courier={courier}
        customerLabel={customer?.name ?? customer?.email ?? null}
        index={order.needs_review ? 2 : 1}
      />

      <AdminOrderParcelPanel
        orderId={order.id}
        status={order.status}
        index={order.needs_review ? 2 : 1}
      />

      {whatsapp && whatsappEntries ? (
        <AdminWhatsAppPanel
          orderId={order.id}
          entries={whatsappEntries}
          optIn={whatsapp[0]?.whatsapp_updates ?? null}
          failed={
            whatsapp[0]?.whatsapp_failed_at
              ? { at: whatsapp[0].whatsapp_failed_at, reason: whatsapp[0].whatsapp_failed_reason }
              : null
          }
          index={order.needs_review ? 3 : 2}
        />
      ) : null}

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
