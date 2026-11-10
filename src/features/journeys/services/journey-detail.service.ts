import "server-only";

import { listOrderEvents } from "@/db/queries/order-events";
import { listVisibleOrderPhotos } from "@/features/order-photos/services/order-photos.service";
import { getOrderGroupById } from "@/db/queries/order-groups";
import { listOrdersByGroup } from "@/db/queries/orders";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { whatsappHref } from "@/components/layout/marketing/links";
import { journeyStageFor } from "@/features/orders/services/journey-stage";
import { deriveJourneyTrack } from "@/features/orders/services/journey-track";
import { getOrder } from "@/features/orders/services/orders.service";
import { listPaymentChannels } from "@/features/payments/services/payment-channels.service";
import { pickProductColour } from "@/features/quotes/components/format";
import { getCustomerRideView } from "@/features/order-delivery/services/customer-ride.service";
import { getViewerDeliveryCode } from "@/db/queries/driver-deliveries";
import { ensureDeliveryCodes } from "@/features/drivers/services/delivery-code.service";
import { loadStageSettings } from "@/features/shipments/stage-settings.service";
import {
  STAGE_RANK,
  currentStageKey as deriveCurrent,
  deriveShipmentProgress,
  transitLabel,
} from "@/features/shipments/stages";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "@/features/orders/types";
import { etaOf, storeNameOf } from "./journeys.service";
import type {
  JourneyDeliverTo,
  JourneyDetailViewModel,
  JourneyItem,
  JourneyPayment,
} from "../types";

/**
 * `v2-detail` — one journey, assembled server-side.
 *
 * Ownership is `getOrder`'s: it 404s an order that is not the viewer's, exactly
 * as the rest of the orders API does, so nothing below has to re-check it.
 *
 * WHAT IS DELIBERATELY ABSENT. The mock shows three things this build does not
 * draw, because nothing in the database backs them: the hub's city when no
 * `hub_received` event has been written, the upstream store's own order number,
 * and a downloadable receipt document. Each would have to be invented, so each
 * element is simply omitted. "Ask about this order" is a WhatsApp deep link
 * rather than a message thread — `message_threads`/`messages` are deferred.
 */
export async function getJourneyDetail(
  user: PlatformUser,
  orderId: string,
): Promise<JourneyDetailViewModel> {
  const client = await createClient();
  const order = await getOrder(client, user, orderId);

  const admin = createAdminClient();
  const [events, photos, group, settings, channels, stageSettings] = await Promise.all([
    listOrderEvents(admin, order.id, { customerVisibleOnly: true }),
    // Ownership is already `getOrder`'s above, so this reads by order id; it
    // never throws, so a storage hiccup costs the pictures and not the page.
    listVisibleOrderPhotos(order.id),
    order.order_group_id ? getOrderGroupById(order.order_group_id) : null,
    // A missing WhatsApp number costs one button, not the page.
    getSiteSettingsMap().catch((error: unknown) => {
      logger.warn("journey detail: site settings unavailable", { error: String(error) });
      return {} as Record<string, unknown>;
    }),
    listPaymentChannels().catch(() => []),
    loadStageSettings(),
  ]);

  const stage = journeyStageFor(order.status);
  const eta = etaOf(order);
  const ride =
    order.status === "in_transit"
      ? await getCustomerRideView(user, order.id, {
          status: order.status,
          held: !!order.held_at,
          stage: deriveCurrent(order.status, events),
        }).catch(() => null)
      : null;
  const deliverTo = deliverToOf(group?.delivery_address ?? null);
  const progress = deriveShipmentProgress({
    status: order.status,
    events,
    settings: stageSettings,
    deliveryKind: deliverTo?.kind ?? null,
  });
  const payment = await loadPayment(admin, order, channels);

  const siblings =
    group && group.item_count > 1
      ? (await listOrdersByGroup(admin, group.id))
          .filter((sibling) => sibling.id !== order.id)
          .map((sibling) => ({
            id: sibling.id,
            orderNo: sibling.order_no,
            productName: sibling.product_name,
          }))
      : [];

  return {
    id: order.id,
    orderNo: order.order_no,
    productName: order.product_name,
    status: order.status,
    // 098: once it has left the hub, the badge names the leg ("Arrived in
    // Ghana"), not the status ("In the air").
    stageLabel: transitLabel(order.status, events, stage.label, stageSettings),
    tone: stage.tone,
    // The eyebrow's "PAID 28 AUG" comes from the payment event, not from the
    // order's `created_at`: an order created on Monday and paid on Thursday is
    // not "paid Monday".
    paidAt: events.find((event) => event.kind === "payment_received")?.occurred_at ?? null,
    track: deriveJourneyTrack({
      status: order.status,
      events,
      etaFrom: eta?.from ?? null,
      etaTo: eta?.to ?? null,
      deliveredAt: order.delivered_at,
    }),
    eta,
    deliverTo,
    updates: events,
    photos,
    pricing: order.pricing,
    adminTotalGhs: order.admin_total_ghs,
    payment,
    item: itemOf(order),
    note: order.special_instructions?.trim() || null,
    whatsappHref:
      typeof settings.whatsapp_number === "string"
        ? whatsappHref(settings.whatsapp_number)
        : null,
    payable:
      order.status === "pending" && (!group || group.status === "pending")
        ? { orderGroupId: group?.id ?? null }
        : null,
    groupSiblings: siblings,
    progress,
    canConfirmReceived: order.status === "in_transit" && !order.held_at,
    ride,
    deliveryCode: await deliveryCodeFor(user, order.id, order.status, progress.current),
  };
}

// ── Deliver to ──────────────────────────────────────────────────────────────

/**
 * The order group's address SNAPSHOT (048), struck at checkout and never
 * re-read from the address book — so a customer who later edits or deletes that
 * address still sees where this parcel was actually sent.
 *
 * Null for a legacy order bought before the bag existed: those have no group and
 * therefore no address, and the tile is omitted rather than guessed at from the
 * customer's current default.
 */
export function deliverToOf(snapshot: Record<string, unknown> | null): JourneyDeliverTo | null {
  if (!snapshot) return null;

  const read = (key: string): string | null => {
    const value = snapshot[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  };

  if (read("kind") === "pickup") {
    const zone = read("zone_name");
    return zone ? { label: `Pickup · ${zone}`, kind: "pickup", lines: [] } : null;
  }

  const label = read("label");
  const area = read("area");
  const city = read("city");
  // `formatAddressLabel`'s shape ("Home · East Legon"), rebuilt here because the
  // snapshot is a loose JSONB object rather than a typed `DeliveryAddress`.
  const name = label && (area || city) ? `${label} · ${area ?? city}` : (label ?? area ?? city);
  if (!name) return null;

  return {
    label: name,
    kind: "door",
    lines: [read("recipient_name"), read("line1"), read("line2"), city, read("digital_address")]
      .filter((line): line is string => !!line),
  };
}

// ── Payment ─────────────────────────────────────────────────────────────────

/**
 * The transaction that settled this order.
 *
 * The link is `payments.order_group_id` for a bag and `metadata->>'order_id'`
 * for a legacy single-order payment — `payments` has no `order_id` column, and
 * the TypeScript has always dug the id out of the metadata (data map
 * §"Existing defects" 2). Only a `success` row counts: a failed attempt is not
 * something to print under "What you paid".
 */
async function loadPayment(
  admin: ReturnType<typeof createAdminClient>,
  order: Order,
  channels: { id: string; label: string }[],
): Promise<JourneyPayment | null> {
  const query = admin
    .from("payments")
    .select("reference, channel, created_at, status, order_group_id, metadata")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data, error } = order.order_group_id
    ? await query.eq("order_group_id", order.order_group_id)
    : await query.eq("metadata->>order_id", order.id);

  if (error) {
    logger.warn("journey detail: payment unavailable", { orderId: order.id, error: error.message });
    return null;
  }

  const row = (data ?? [])[0] as
    | { reference: string; channel: string | null; created_at: string }
    | undefined;
  if (!row) return null;

  const raw = row.channel?.trim() || null;
  return {
    // The admin's own label for the channel when it is one of theirs, so the
    // receipt says "MTN MoMo" rather than Paystack's "mobile_money".
    channelLabel: raw ? (channels.find((c) => c.id === raw)?.label ?? raw) : null,
    paidAt: row.created_at,
    reference: row.reference,
  };
}

// ── The item card ───────────────────────────────────────────────────────────

/**
 * "Amazon · USA" / "Black · Qty 1 · 8.8 oz" (design line 366).
 *
 * The variant is the listing's own colour and size, never a guess: an order
 * whose extraction snapshot has been pruned shows the quantity alone.
 */
function itemOf(order: Order): JourneyItem {
  const product = order.extraction_metadata?.product ?? null;
  const colour = product ? pickProductColour(product) : null;
  const variantParts = [colour?.selected ?? null, product?.size ?? null].filter(
    (part): part is string => !!part,
  );

  return {
    store: storeNameOf(order),
    country: order.origin_country,
    variant: variantParts.length > 0 ? variantParts.join(" · ") : null,
    weightLbs: order.pricing?.weight_lbs ?? product?.weight_lbs ?? null,
    quantity: order.quantity,
    url: order.product_url,
    imageUrl: order.product_image_url ?? product?.image ?? null,
  };
}

/**
 * 102: the code the customer gives the driver, once the parcel is at our Accra
 * warehouse or nearer. An order that got there before codes existed is issued
 * one now. A failure costs the code card, never the page.
 */
async function deliveryCodeFor(
  user: PlatformUser,
  orderId: string,
  status: string,
  stage: ReturnType<typeof deriveCurrent>,
): Promise<string | null> {
  if (status !== "in_transit" || !stage || STAGE_RANK[stage] < STAGE_RANK.ghana_warehouse) return null;
  try {
    const code = await getViewerDeliveryCode(user.id, orderId);
    if (code) return code;
    await ensureDeliveryCodes([orderId]);
    return await getViewerDeliveryCode(user.id, orderId);
  } catch (error) {
    logger.warn("journey detail: delivery code unavailable", { orderId, error: String(error) });
    return null;
  }
}
