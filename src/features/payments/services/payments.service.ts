import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { Payment } from "@/features/payments/types";
import type { Order } from "@/features/orders/types";
import {
  getOrderById,
  linkOrderToPayment,
  sendOrderStatusEmail,
} from "@/features/orders/services/orders.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { listOrdersByGroup } from "@/db/queries/orders";
import { getOrderGroupById, updateOrderGroupStatus } from "@/db/queries/order-groups";
import { getCarOrderById, updateCarOrderStatus } from "@/db/queries/car-orders";
// Pure module by design (no `server-only`, no Supabase), so importing it here
// costs this service nothing and gives the car path one source for its state
// machine and its payability rule — shared with the checkout service and with
// any console, rather than restated.
import {
  CAR_ORDER_STATUSES,
  carChargeBlockedReason,
} from "@/features/cars/car-orders.types";
import { getPaymentChannel } from "@/features/payments/services/payment-channels.service";
import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
} from "@/lib/paystack/client";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createOrderNotifications } from "@/features/notifications/services/notifications.service";
import { env } from "@/lib/env";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES, PAYMENT_STATUSES } from "@/config/constants";
import type { PaystackWebhookEvent } from "@/features/payments/schema";
import { isPayablePricing } from "@/lib/pricing/payable";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import type { PlatformUser } from "@/features/users/types";
import type {
  InitializePaymentResponse,
  PaymentChannel,
  PaymentInsert,
  PaymentResponse,
} from "@/features/payments/types";
import type { InitializePaymentInput } from "@/features/payments/schema";

// ── DB queries ────────────────────────────────────────────────────────────────


async function insertPayment(
  client: SupabaseClient,
  payment: PaymentInsert
): Promise<Payment | null> {
  const { data, error } = await client
    .from("payments")
    .insert(payment)
    .select()
    .single();

  if (error) {
    logger.error("insertPayment failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as Payment;
}

async function getPaymentByReference(
  client: SupabaseClient,
  reference: string
): Promise<Payment | null> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .single();

  if (error) return null;
  return data as Payment;
}

async function getPaymentsByUserId(
  client: SupabaseClient,
  userId: string
): Promise<Payment[]> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getPaymentsByUserId failed", { userId, error: error.message });
    return [];
  }
  return (data ?? []) as Payment[];
}

/**
 * What a charge is for: one legacy order, one bag's order group, or one car
 * (068).
 *
 * A CLOSED UNION WITH `never` ON THE ABSENT KEYS, which is what makes it
 * impossible to hand this function two targets at once. The third case carries
 * the same shape for the same reason, and `initializePaymentSchema` mirrors it
 * at the edge — the two must be changed together.
 */
export type ChargeTarget =
  | { orderId: string; groupId?: never; carOrderId?: never }
  | { groupId: string; orderId?: never; carOrderId?: never }
  | { carOrderId: string; orderId?: never; groupId?: never };

/**
 * The newest payment that already has a claim on this target — pending or
 * successful.
 *
 * One query for all three shapes. They differ only in how the payment names its
 * target: a legacy order is reachable only through `metadata->>order_id`
 * (there was never a column), while a group has the real `order_group_id`
 * column 048 added and a car order has `car_order_id` from 068. Everything
 * else — the status filter, the ordering, the limit — is the same guard, and
 * the two copies of it drifted apart once already, which is why the third case
 * was added here rather than beside it.
 */
export async function findActivePayment(client: SupabaseClient, target: ChargeTarget): Promise<Payment | null> {
  const base = client.from("payments").select("*");
  const scoped =
    target.carOrderId != null
      ? base.eq("car_order_id", target.carOrderId)
      : target.groupId != null
        ? base.eq("order_group_id", target.groupId)
        : base.filter("metadata->>order_id", "eq", target.orderId);

  const { data } = await scoped
    .in("status", [PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.SUCCESS])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as Payment | null;
}

/**
 * Refuse to open a second transaction for something already being paid for.
 *
 * `noun` is the customer-facing word for the target ("order" / "bag" / "car") so
 * the callers share the guard without sharing the wording — a customer paying
 * for a bag should not be told about an "order" they never made.
 *
 * THIS IS ALSO WHY THERE IS NO DEPOSIT ON A CAR. A deposit model needs several
 * successful payments against one target, which is precisely what this refuses.
 * Relaxing it to let cars through would remove the double-charge guard from
 * every other path at the same time. 068's header is the long version.
 */
async function assertNoActivePayment(client: SupabaseClient, target: ChargeTarget, noun: string): Promise<void> {
  const existing = await findActivePayment(client, target);
  if (!existing) return;
  if (existing.status === PAYMENT_STATUSES.SUCCESS) {
    throw new APIError(409, `This ${noun} has already been paid.`);
  }
  throw new APIError(409, `A payment is already in progress for this ${noun}.`);
}

async function getAllPayments(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string }
): Promise<Payment[]> {
  let query = client
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.userId) query = query.eq("user_id", filters.userId);

  const { data, error } = await query;

  if (error) {
    logger.error("getAllPayments failed", { error: error.message });
    return [];
  }
  return (data ?? []) as Payment[];
}

/**
 * Move a payment from one status to another, atomically.
 *
 * The `.eq("status", fromStatus)` guard is what makes the money path idempotent.
 * Paystack reports the same charge twice — once when it redirects the customer's
 * browser back, once over the webhook — and the two arrive concurrently. Both can
 * read a pending payment and both can verify it successfully; only the update that
 * actually matches a still-pending row comes back with data. The loser gets null
 * and must skip the follow-on effects rather than repeat them.
 *
 * Returns null ONLY when no row matched, i.e. this caller lost the race. A real
 * database failure throws instead: the two are not interchangeable, because
 * treating a failed write as "someone else won" would report the payment as
 * settled to the customer while the order silently stayed unpaid.
 */
export async function transitionPaymentStatus(
  client: SupabaseClient,
  paymentId: string,
  fromStatus: string,
  toStatus: string,
  metadata?: Record<string, unknown>,
  channel?: string
): Promise<Payment | null> {
  const update: Record<string, unknown> = { status: toStatus };
  if (metadata) update.metadata = metadata;
  if (channel) update.channel = channel;

  const { data, error } = await client
    .from("payments")
    .update(update)
    .eq("id", paymentId)
    .eq("status", fromStatus)
    .select()
    .maybeSingle();

  if (error) {
    logger.error("transitionPaymentStatus failed", {
      paymentId,
      fromStatus,
      toStatus,
      code: error.code,
      message: error.message,
    });
    throw new APIError(502, "Could not record the payment result");
  }
  return data as Payment | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    id: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    channel: payment.channel ?? null,
    createdAt: payment.created_at,
  };
}

function orderIdOf(payment: Payment): string | null {
  const orderId = (payment.metadata as Record<string, unknown> | null)?.order_id;
  return typeof orderId === "string" ? orderId : null;
}

/** What a payment buys: one legacy order, a bag's order group, or one car. */
interface PayTarget {
  orderId: string | null;
  groupId: string | null;
  carOrderId: string | null;
}

function targetOf(payment: Payment): PayTarget {
  return {
    orderId: orderIdOf(payment),
    groupId: payment.order_group_id ?? null,
    carOrderId: payment.car_order_id ?? null,
  };
}

const NO_TARGET: PayTarget = { orderId: null, groupId: null, carOrderId: null };

/**
 * Did the reconciliation job (059) release this payment for inactivity? Only
 * those rows carry `metadata.expired_at`; a payment Paystack reported as failed
 * or reversed never gets it.
 */
export function wasExpiredByUs(payment: Pick<Payment, "metadata">): boolean {
  return typeof (payment.metadata as Record<string, unknown> | null)?.expired_at === "string";
}

/**
 * Where to send the customer back to after Paystack.
 *
 * These must resolve to routes that actually exist — the customer's orders live
 * under /app/orders, and a redirect to a non-existent path turns a declined card
 * into a 404 with no explanation of what happened to their money.
 *
 * A group's failure lands on the bag, where the customer retries: the cart is
 * already `checked_out`, so the bag reads empty and shows the pending-group
 * card. A legacy order's failure lands on that order's detail page.
 *
 * A CAR LANDS ON /app/cars — the forecourt — AND NOT ON THE VEHICLE'S OWN PAGE,
 * for two reasons that both come back to the rule above.
 *
 * The first is that this function does not hold what that page is keyed by.
 * `/app/cars/[slug]` is addressed by SLUG, which lives on `car_listings`, while
 * a payment names a `car_orders` id; producing the slug means a join on the one
 * path that runs for EVERY callback and EVERY webhook delivery, and it would
 * have to make these two lines async at seven call sites to do it.
 *
 * The second is the one that settles it: that page is `getPublishedCarBySlug`,
 * which `notFound()`s on an unpublished listing. Taking a sold car off the site
 * is the first thing an admin does after a sale, so a success redirect to the
 * detail page would hand the customer a 404 seconds after a five-figure payment
 * — precisely the failure this comment exists to forbid, arrived at by trying
 * to be helpful. `/app/cars` is public, always renders, and never 404s.
 *
 * `car=` carries the car order id so that screen can name the purchase when it
 * grows a notice for it. These two lines remain the only place to change.
 * Verified against the routes on disk: `src/app/app/cars/page.tsx`.
 */
function successUrl(target: PayTarget): string {
  if (target.carOrderId) return `${env.app.url}/app/cars?payment=success&car=${target.carOrderId}`;
  if (target.groupId) return `${env.app.url}/app/orders?payment=success&group=${target.groupId}`;
  return target.orderId
    ? `${env.app.url}/app/orders/${target.orderId}?payment=success`
    : `${env.app.url}/app/orders?payment=success`;
}

function failureUrl(
  target: PayTarget,
  reason: "failed" | "error" = "failed"
): string {
  // The forecourt for a failure too. The customer's retry is the Buy button on
  // the car, which `/app/cars` is one tap from — and their `pending_payment`
  // order is still theirs, so `claimCar` hands the same row back and charges it
  // again rather than refusing them the car they were halfway through buying.
  if (target.carOrderId) return `${env.app.url}/app/cars?payment=${reason}&car=${target.carOrderId}`;
  if (target.groupId) return `${env.app.url}/app/bag?payment=${reason}`;
  // The per-order checkout SCREEN is gone (F5) — the order detail page absorbed
  // its one job. A legacy order's failure therefore lands on the order itself,
  // which renders the notice and offers the retry.
  return target.orderId
    ? `${env.app.url}/app/orders/${target.orderId}?payment=${reason}`
    : `${env.app.url}/app/orders?payment=${reason}`;
}

/**
 * Where to send a customer whose return from Paystack could not be resolved to a
 * payment at all — an unparseable reference, or a failure before we knew which
 * order they were paying for.
 */
export function unresolvedPaymentUrl(): string {
  return failureUrl(NO_TARGET, "error");
}

// ── Service functions ─────────────────────────────────────────────────────────

/** One transaction for one order (legacy), one order group (the bag), or one car. */
export async function initializePayment(
  user: PlatformUser,
  input: InitializePaymentInput,
): Promise<InitializePaymentResponse> {
  const admin = createAdminClient();

  // Paystack keys the transaction on the customer's email, and PlatformUser
  // inherits an optional email from Supabase's User. Refuse explicitly rather
  // than failing inside the Paystack call with a payment row already written.
  if (!user.email) {
    throw new APIError(400, "Your account has no email address. Please contact support.");
  }

  // `initializePaymentSchema` has already established that exactly one of the
  // three is present, so this chain is a dispatch and not a guess.
  const charge = input.carOrderId
    ? await carCharge(admin, user, input.carOrderId, input.channel)
    : input.orderGroupId
      ? await groupCharge(admin, user, input.orderGroupId, input.channel)
      : await orderCharge(admin, user, input.orderId!);

  const reference = generatePaymentReference();
  const payment = await insertPayment(admin, {
    user_id: user.id,
    reference,
    amount: charge.amountPesewas,
    currency: "GHS",
    status: PAYMENT_STATUSES.PENDING,
    metadata: charge.metadata,
    ...(charge.target.groupId && { order_group_id: charge.target.groupId }),
    ...(charge.target.carOrderId && { car_order_id: charge.target.carOrderId }),
  });

  if (!payment) {
    throw new APIError(500, "Failed to create payment");
  }

  let authorizationUrl: string;
  try {
    const callbackUrl = `${env.app.url}/api/payments/callback`;
    const paystackResponse = await initializeTransaction({
      email: user.email,
      amount: charge.amountPesewas,
      reference,
      callbackUrl,
      channels: charge.channels,
      ...(charge.paystackMetadata && { metadata: charge.paystackMetadata }),
    });
    authorizationUrl = paystackResponse.data.authorization_url;
  } catch (error) {
    // Best effort: if this write also fails, the Paystack error below is the
    // more useful thing to report, so swallow rather than mask it. The payment
    // is left pending and the customer's retry is blocked by R2 until it is
    // reconciled — logged loudly for that reason.
    await transitionPaymentStatus(
      admin,
      payment.id,
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.FAILED,
      { ...charge.metadata, error: "Paystack initialization failed" },
    ).catch((markError: unknown) => {
      logger.error("Could not mark payment failed after Paystack error", {
        paymentId: payment.id,
        reference,
        error: markError instanceof Error ? markError.message : String(markError),
      });
    });

    logger.error("Paystack initializeTransaction failed", {
      reference,
      ...charge.target,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new APIError(502, "Payment provider error. Please try again.");
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "payment_initialized",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      ...(charge.target.carOrderId
        ? { carOrderId: charge.target.carOrderId }
        : charge.target.groupId
          ? { orderGroupId: charge.target.groupId }
          : { orderId: charge.target.orderId }),
      reference,
      amount: charge.amountPesewas,
      channel: charge.channels,
    },
  });

  return { payment: toPaymentResponse(payment), authorizationUrl };
}

/** Everything the Paystack call and the payment row need, decided server-side. */
interface Charge {
  target: PayTarget;
  amountPesewas: number;
  channels: string[];
  metadata: Record<string, unknown>;
  paystackMetadata: Record<string, unknown> | null;
}

const DEFAULT_CHANNELS = ["card", "mobile_money"];

/**
 * Is this order safe to charge without a person looking at it first?
 *
 * `needs_review` is a broad flag: it is set by anything worth a human glance,
 * including a customer renaming a product or an origin country we could not
 * infer. Refusing payment on all of it was too blunt — it stopped a bag being
 * paid for over a renamed item whose price came straight from the store, and
 * nothing in the app told the customer why.
 *
 * What actually matters at the moment money moves is narrower: is the PRICE one
 * we verified? Two things make it not:
 *
 *  - the breakdown is not a real price at all (`needs_review` pricing method, or
 *    a total of zero). `isPayablePricing` is the shared predicate for that;
 *  - the item price came from the CUSTOMER rather than the store, which is the
 *    gap-filler path. That is the one that lets somebody name a dollar for a
 *    two thousand dollar laptop, so it stays blocked until an admin sets a
 *    total.
 *
 * A buyer-sourced price is neither: `order-intake.service.ts` deliberately does
 * not flag those, because a buyer IS the human review.
 *
 * KNOWN BLIND SPOT, recorded rather than guessed at. On the order row a buyer's
 * price and a customer's typed price look identical: both are an
 * `estimated_price_usd` with no store price behind them, and the provenance of
 * the buyer's figure lives on the `price_watches` row and in `audit_logs`, not
 * here. So if anything ever flags a sourced order again, this predicate WILL
 * refuse to charge it, exactly as it did for the ten minutes between bcb86be
 * and edfeab9 when sourcing was unpayable in production. The protection today
 * is that intake does not flag those orders, and the test named "a buyer
 * sourced order is chargeable" is what holds that in place: if it ever fails,
 * sourcing checkout is broken, whatever the rest of the suite says. Making this
 * robust rather than merely correct needs the provenance ON the order, which is
 * a column and a migration, and belongs with whoever next touches intake.
 */
function chargeBlockedReason(order: Order): string | null {
  if (!isPayablePricing(order.pricing)) return "priced";
  if (!order.needs_review) return null;
  if (order.admin_total_ghs != null) return null;
  // The snapshot's own price is the evidence the store named this figure.
  const storePrice = order.extraction_metadata?.product?.price;
  const fromStore = typeof storePrice === "number" && storePrice > 0;
  return fromStore ? null : "unverified";
}

async function orderCharge(admin: SupabaseClient, user: PlatformUser, orderId: string): Promise<Charge> {
  const order = await getOrderById(admin, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "pending") throw new APIError(400, "Order is not awaiting payment");
  // A bag's orders are paid once, as a group: charging one line on its own would
  // split the total and leave the group half-paid. The order detail page sends
  // these to the bag instead, but the rule is money, so it is enforced here too.
  if (order.order_group_id) throw new APIError(400, "This item is part of a bag. Pay for the bag as one.");

  // An order flagged for review carries a total nobody has verified: a price
  // the customer typed, a link that did not match its snapshot, an extraction
  // that came back incomplete. Only the UI used to hide the Pay button, so a
  // direct POST could pay a $1 estimate for a $2,000 item. The admin's re-price
  // (`admin_total_ghs`) is what makes it payable.
  if (chargeBlockedReason(order)) {
    throw new APIError(400, "This order is waiting for our review before it can be paid.");
  }

  await assertNoActivePayment(admin, { orderId }, "order");

  // Use admin-set price if available, otherwise use calculated pricing
  const totalGhs = order.admin_total_ghs ?? order.pricing.total_ghs;
  if (!totalGhs || totalGhs <= 0) {
    throw new APIError(400, "Order pricing has not been determined yet. Please wait for admin review.");
  }
  return {
    target: { orderId, groupId: null, carOrderId: null },
    amountPesewas: Math.round(totalGhs * 100),
    channels: DEFAULT_CHANNELS,
    metadata: { order_id: orderId },
    paystackMetadata: null,
  };
}

async function groupCharge(admin: SupabaseClient, user: PlatformUser, groupId: string, channelId?: string): Promise<Charge> {
  const group = await getOrderGroupById(groupId);
  if (!group || group.user_id !== user.id) throw new APIError(404, "Order group not found");
  if (group.status === "paid") throw new APIError(400, "This bag has already been paid");
  if (group.status !== "pending") throw new APIError(400, "This bag is not awaiting payment");

  await assertNoActivePayment(admin, { groupId }, "bag");

  // The amount is the group's own column, struck at checkout — never re-read from the bag.
  if (!(group.total_pesewas > 0)) throw new APIError(400, "This bag has nothing to pay for");

  let channel: PaymentChannel | null = null;
  if (channelId) {
    channel = await getPaymentChannel(channelId);
    if (!channel) throw new APIError(400, "Choose a payment method");
  }

  const orders = await listOrdersByGroup(admin, groupId);

  // A POSITIVE GROUP TOTAL IS NOT PROOF THE BAG IS PAYABLE. `total_pesewas`
  // includes the delivery fee, which is charged once per checkout and does not
  // belong to any line, so a bag whose every item is waiting for review still
  // carries a total above zero: a tomame-7f session found the bag offering to
  // charge GH₵40, the delivery fee alone, for a $34.50 item nobody had priced.
  // The same rule the single-order path uses applies here, per line: an order
  // flagged for review is payable only once an admin has set its total.
  const unreviewed = orders.filter((o) => chargeBlockedReason(o) !== null);
  if (unreviewed.length > 0) {
    throw new APIError(
      400,
      unreviewed.length === orders.length
        ? "This bag is waiting for our review before it can be paid."
        : `${unreviewed.length} item${unreviewed.length === 1 ? " is" : "s are"} waiting for our review before this bag can be paid.`,
    );
  }

  const orderIds = orders.map((o) => o.id);
  const ids = { order_group_id: groupId, order_ids: orderIds };
  return {
    target: { orderId: null, groupId, carOrderId: null },
    amountPesewas: group.total_pesewas,
    channels: channel ? [channel.paystack_channel] : DEFAULT_CHANNELS,
    metadata: { ...ids, requested_channel: channel?.id ?? null, provider: channel?.provider ?? null },
    paystackMetadata: ids,
  };
}

/**
 * One car, one charge, paid in full (068).
 *
 * THE AMOUNT IS THE SNAPSHOT ON THE CAR ORDER, AND IS NEVER RECOMPUTED. It is
 * not read from `car_listings` here, not re-derived from the breakdown, and not
 * taken from the request — `car_orders.price_pesewas` was copied from the
 * listing at checkout and that figure is the one the customer agreed to. A
 * listing's price is a live, admin-edited number on a public page: 067 gives
 * repricing its own audit action because buyers really do correct it when a
 * freight quote lands, and a reprice between "Buy" and this line would charge
 * somebody a total they never saw. Same rule as `groupCharge` above, whose
 * comment reads "never re-read from the bag".
 *
 * NO `chargeBlockedReason` HERE, DELIBERATELY. That predicate demands a
 * `PricingBreakdown` struck by `src/lib/pricing/calculator.ts`, and a car price
 * is four quotes an admin typed — 067 is emphatic that the calculator has never
 * seen a bill of lading. Synthesising a fake breakdown to satisfy it is the
 * mistake `src/lib/pricing/payable.ts` catalogues three production bugs from.
 * `carChargeBlockedReason` asks what is actually true of a car order instead.
 *
 * `channel` is honoured the way the bag honours it: a car is the largest MoMo
 * transaction this platform will ever attempt and the customer should be able
 * to pick the network that will actually clear it.
 */
async function carCharge(
  admin: SupabaseClient,
  user: PlatformUser,
  carOrderId: string,
  channelId?: string,
): Promise<Charge> {
  const carOrder = await getCarOrderById(carOrderId);
  // Someone else's car order is indistinguishable from a missing one, as
  // `orderCharge` treats someone else's order: a 403 would confirm the id names
  // a real purchase, and who is buying which vehicle is exactly what a rival
  // bidder wants.
  if (!carOrder || carOrder.user_id !== user.id) throw new APIError(404, "Car order not found");

  const blocked = carChargeBlockedReason(carOrder);
  if (blocked === "paid") throw new APIError(400, "This car has already been paid for");
  if (blocked === "not_awaiting_payment") throw new APIError(400, "This car order is not awaiting payment");
  if (blocked === "unpriced") throw new APIError(400, "This car order has no price to charge");

  await assertNoActivePayment(admin, { carOrderId }, "car");

  let channel: PaymentChannel | null = null;
  if (channelId) {
    channel = await getPaymentChannel(channelId);
    if (!channel) throw new APIError(400, "Choose a payment method");
  }

  const ids = { car_order_id: carOrderId, car_listing_id: carOrder.car_listing_id };
  return {
    target: { orderId: null, groupId: null, carOrderId },
    amountPesewas: carOrder.price_pesewas,
    channels: channel ? [channel.paystack_channel] : DEFAULT_CHANNELS,
    metadata: { ...ids, requested_channel: channel?.id ?? null, provider: channel?.provider ?? null },
    paystackMetadata: ids,
  };
}

export async function handlePaymentCallback(
  reference: string,
): Promise<{ redirectUrl: string }> {
  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Payment callback for unknown reference", { reference });
    throw new APIError(404, "Payment not found");
  }

  const target = targetOf(payment);
  const { orderId } = target;

  // Already finalized — by the other delivery channel, or by an earlier attempt.
  // Report the outcome; never re-run the effects.
  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { redirectUrl: successUrl(target) };
  }
  // A payment WE released for inactivity (059) is the one kind of `failed` that
  // can still turn into money: the customer may reopen the Paystack link and
  // pay. So it goes on to verification, and a success below moves it
  // `failed → success`. A payment Paystack itself declared failed is final.
  const recoveringExpired = payment.status === PAYMENT_STATUSES.FAILED && wasExpiredByUs(payment);
  if (payment.status === PAYMENT_STATUSES.FAILED && !recoveringExpired) {
    return { redirectUrl: failureUrl(target) };
  }
  // Fixed HERE, before the verify call, so the guarded update below always
  // names the status this caller READ. The whole race depends on that.
  const fromStatus = recoveringExpired ? PAYMENT_STATUSES.FAILED : PAYMENT_STATUSES.PENDING;

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(reference);
  } catch (error) {
    logger.error("Paystack verification failed", {
      reference,
      error: error instanceof Error ? error.message : String(error),
    });
    // Transient: leave the payment pending so the webhook retry can finish it.
    throw new APIError(502, "Payment verification failed");
  }

  const paystackStatus = verification.data.status;
  const verifyData = verification.data as unknown as Record<string, unknown>;
  // Merge rather than replace — the order_id written at initialization is the
  // only link from a payment back to its order.
  const baseMetadata = (payment.metadata as Record<string, unknown> | null) ?? {};

  // A charge only counts if Paystack says it succeeded AND it is the charge we
  // asked for. Without the amount and currency comparison, an underpaid or
  // wrong-currency charge would silently promote the order to paid.
  const amountMatches = verification.data.amount === payment.amount;
  const currencyMatches = verification.data.currency === payment.currency;
  const isSuccess = paystackStatus === "success" && amountMatches && currencyMatches;

  if (paystackStatus === "success" && !isSuccess) {
    logger.error("Paystack verification mismatch — refusing to mark paid", {
      reference,
      ...target,
      expectedAmount: payment.amount,
      actualAmount: verification.data.amount,
      expectedCurrency: payment.currency,
      actualCurrency: verification.data.currency,
    });
  }

  if (isSuccess) {
    const claimed = await transitionPaymentStatus(
      admin,
      payment.id,
      fromStatus,
      PAYMENT_STATUSES.SUCCESS,
      {
        ...baseMetadata,
        paystack_verification: verifyData,
        ...(recoveringExpired && { recovered_after_expiry_at: new Date().toISOString() }),
      },
      verification.data.channel,
    );

    // Lost the race to the other delivery channel — it owns the side effects.
    if (!claimed) {
      return { redirectUrl: successUrl(target) };
    }

    // ONE FAN-OUT FOR BOTH DELIVERY CHANNELS. The webhook funnels through this
    // same function, so a target routed here is routed for the callback and the
    // webhook at once and the two cannot disagree about what settling means.
    let ordersSettled = 0;
    if (target.carOrderId) {
      ordersSettled = (await settleCarOrder(payment, target.carOrderId)) ? 1 : 0;
    } else if (target.groupId) {
      ordersSettled = await settleGroup(admin, payment, target.groupId);
    } else if (orderId) {
      const order = await settleOrder(admin, payment, orderId);
      if (order) ordersSettled = 1;
      // One order, one email — the group path sends its own.
      if (order) sendOrderStatusEmail(payment.user_id, order, "paid");
    }

    // Money arrived and nothing was left to settle: the order (or bag) had
    // already been cancelled, by the customer or by the unpaid-order sweep. The
    // customer has paid for something that is no longer theirs and is owed a
    // refund or a reinstatement — an admin decision, made visible here rather
    // than inferred later.
    const needsRefundReview = ordersSettled === 0;
    if (needsRefundReview) {
      logger.error("Payment settled for an order that is no longer pending — refund review needed", {
        reference,
        ...target,
        paymentId: payment.id,
      });
    }

    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: recoveringExpired ? "payment_recovered_after_expiry" : "payment_successful",
      entityType: "payment",
      entityId: payment.id,
      metadata: { reference, ...target, ordersSettled, needsRefundReview },
    });

    return { redirectUrl: successUrl(target) };
  }

  // An expired payment that still is not paid is already `failed`; there is
  // nothing to move and nothing new to audit.
  if (recoveringExpired) {
    return { redirectUrl: failureUrl(target) };
  }

  const failed = await transitionPaymentStatus(
    admin,
    payment.id,
    PAYMENT_STATUSES.PENDING,
    PAYMENT_STATUSES.FAILED,
    { ...baseMetadata, paystack_verification: verifyData },
  );

  // Lost the race to the other delivery channel — it owns the audit trail.
  if (!failed) {
    return { redirectUrl: failureUrl(target) };
  }

  // A failed group payment leaves the group pending: the customer retries from
  // the bag with a fresh transaction. Nothing is cancelled here.
  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "payment_failed",
    entityType: "payment",
    entityId: payment.id,
    metadata: { reference, ...target, paystackStatus, amountMatches, currencyMatches },
  });

  return { redirectUrl: failureUrl(target) };
}

/**
 * pending → paid for one order. Null when the order had already flipped (the
 * status guard in `linkOrderToPayment` matched nothing) — then no audit row, no
 * notification, so a re-run of the fan-out never repeats an effect.
 */
async function settleOrder(admin: SupabaseClient, payment: Payment, orderId: string): Promise<Order | null> {
  const order = await linkOrderToPayment(admin, orderId, payment.id);
  if (!order) return null;

  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "order_status_changed",
    entityType: "order",
    entityId: orderId,
    metadata: { from: "pending", to: "paid", paymentId: payment.id, orderGroupId: payment.order_group_id ?? null },
  });

  // The customer's half of the same fact (050). `linkOrderToPayment` above only
  // flips an order still in `pending`, so a webhook arriving after a callback
  // returns null and never gets here — which is exactly what keeps this from
  // writing the line twice.
  await recordOrderEvent({
    order_id: orderId,
    order_group_id: payment.order_group_id ?? null,
    kind: "payment_received",
    title: "Payment received",
    // What they paid with, as Paystack reported it. Null rather than "card"
    // when the channel is unknown — an invented method is worse than none.
    detail: payment.channel?.trim() || null,
    occurred_at: payment.created_at,
  });

  await createOrderNotifications(
    payment.user_id,
    orderId,
    order.product_name,
    order.admin_total_ghs ?? order.pricing.total_ghs,
  );
  return order;
}

/**
 * Fan `paid` out over every order in the group, then flip the group itself.
 * Each step is guarded on its own current status, so a second pass (a webhook
 * after a callback that died halfway) finishes what is left and repeats nothing.
 */
async function settleGroup(admin: SupabaseClient, payment: Payment, groupId: string): Promise<number> {
  const orders = await listOrdersByGroup(admin, groupId);
  let first: Order | null = null;
  let settledCount = 0;
  for (const order of orders) {
    const settled = await settleOrder(admin, payment, order.id);
    if (settled) {
      first ??= settled;
      settledCount += 1;
    }
  }

  const flipped = await updateOrderGroupStatus(groupId, "pending", "paid", { payment_id: payment.id });
  if (flipped) {
    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "order_group_paid",
      entityType: "order_group",
      entityId: groupId,
      metadata: { paymentId: payment.id, order_ids: orders.map((o) => o.id) },
    });
  }

  // One email per group. A group template is Phase 5+; until then the first
  // order's "paid" mail stands in for the whole bag.
  if (first) sendOrderStatusEmail(payment.user_id, first, "paid");
  return settledCount;
}

/**
 * pending_payment → paid for one car (068). True when THIS caller made the move.
 *
 * THE COMPARE-AND-SET IS THE WHOLE MECHANISM. `updateCarOrderStatus` carries
 * `.eq("status", "pending_payment")`, so of the two deliveries Paystack makes
 * for one charge — the browser redirect and the webhook, which arrive
 * concurrently — only one UPDATE matches a still-pending row. The other gets
 * `false` and returns before writing anything, which is what keeps the audit
 * trail to exactly one `car_order_paid` row for one car.
 *
 * FALSE IS NOT AN ERROR AND AN ERROR IS NOT FALSE. `updateCarOrderStatus`
 * throws when the write genuinely failed, and that throw propagates: the
 * customer sees a failure and the reconciliation sweep can retry, rather than
 * being shown a paid car over a row that never moved. This is the same
 * distinction `transitionPaymentStatus` documents at length, one layer down.
 *
 * FALSE ALSO COVERS THE CASE WORTH AN ALARM: money arrived for a car order that
 * had already been cancelled — released for an abandoned checkout, say, and
 * possibly sold to somebody else since. The caller counts this as "nothing
 * settled" and raises the refund-review log, which is exactly right; there is no
 * quiet reinstatement, because a car that has been resold cannot be reinstated
 * by a status write.
 *
 * NO EMAIL. `sendOrderStatusEmail` takes an `Order` and renders a parcel's
 * template — product name, origin country, freight — none of which describes a
 * vehicle. Writing a car receipt into that template would send a customer who
 * has just paid five figures a mail about a shipment from the USA. The audit row
 * and the admin queue carry the sale until a car template exists.
 */
async function settleCarOrder(payment: Payment, carOrderId: string): Promise<boolean> {
  const flipped = await updateCarOrderStatus(
    carOrderId,
    CAR_ORDER_STATUSES.PENDING_PAYMENT,
    CAR_ORDER_STATUSES.PAID,
    { payment_id: payment.id, paid_at: new Date().toISOString() },
  );
  if (!flipped) return false;

  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: AUDIT_ACTOR_ROLES.SYSTEM,
    action: "car_order_paid",
    entityType: AUDIT_ENTITY_TYPES.CAR_ORDER,
    entityId: carOrderId,
    metadata: {
      from: CAR_ORDER_STATUSES.PENDING_PAYMENT,
      to: CAR_ORDER_STATUSES.PAID,
      paymentId: payment.id,
      reference: payment.reference,
      // What was actually taken, from the payment row rather than from the car
      // order: if these two ever disagree, the audit log is where that is found.
      amountPesewas: payment.amount,
      channel: payment.channel ?? null,
    },
  });

  return true;
}

/**
 * Handle a verified Paystack webhook delivery.
 *
 * Retry contract: returning normally tells the route to answer 2xx and Paystack
 * stops redelivering. That is what we want for anything we have deliberately
 * declined — an event type we do not handle, a reference we do not recognize,
 * a charge already finalized — since redelivering those can never change the
 * outcome. Throwing propagates to the route as a non-2xx so Paystack retries,
 * and is reserved for transient faults (a failed verification call) where a
 * later attempt can still succeed.
 */
export async function handleWebhookEvent(
  event: PaystackWebhookEvent,
): Promise<{ message: string }> {
  if (event.event !== "charge.success") {
    return { message: "Event ignored" };
  }

  // `reference` is optional on the way in because one URL receives every event
  // type on the account and most of them carry a different `data` shape — see
  // `paystackWebhookSchema`. By here the event IS a charge, so a missing
  // reference is Paystack sending us something we have never seen rather than a
  // bystander event, and there is nothing to look up. Answered normally so the
  // delivery is not retried: redelivering the same body cannot grow a reference.
  const { reference } = event.data;
  if (!reference) {
    logger.warn("charge.success webhook with no reference", { event: event.event });
    return { message: "No reference, ignored" };
  }

  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Webhook for unknown payment reference", { reference });
    return { message: "Payment not found, ignored" };
  }

  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { message: "Already processed" };
  }

  try {
    await handlePaymentCallback(reference);
  } catch (err) {
    logger.error("Webhook handlePaymentCallback failed", {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return { message: "Webhook processed" };
}

export interface TransactionListResponse {
  transactions: PaymentResponse[];
  count: number;
}

export async function listUserTransactions(
  client: SupabaseClient,
  user: PlatformUser,
): Promise<TransactionListResponse> {
  const payments = await getPaymentsByUserId(client, user.id);
  return {
    transactions: payments.map(toPaymentResponse),
    count: payments.length,
  };
}

export async function listAllTransactions(
  client: SupabaseClient,
  user: PlatformUser,
  filters?: { status?: string; userId?: string },
): Promise<TransactionListResponse> {
  if (!canAccessAdmin(user)) {
    throw new APIError(403, "Admin access required");
  }

  const payments = await getAllPayments(client, filters);
  return {
    transactions: payments.map(toPaymentResponse),
    count: payments.length,
  };
}
