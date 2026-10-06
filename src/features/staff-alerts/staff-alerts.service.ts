import "server-only";

import {
  claimStaffAlertSend,
  finishStaffAlertSend,
  getStaffCarOrder,
  getStaffCustomer,
  getStaffGroup,
  getStaffOrder,
  getStaffAssistedRequest,
  getStaffPayment,
  getStaffSourcingRequest,
  listStaffOrdersByGroup,
  readSiteSettingValues,
  type StaffOrderRow,
  type StaffPaymentRow,
} from "@/db/queries/staff-alerts";
import { alertsEnabled, environmentLabel } from "@/features/ops/alert-recipients";
import { sendEmail } from "@/lib/email/transport";
import {
  formatStaffGhs,
  staffOrderAlertTemplate,
  type StaffAlertEmailData,
  type StaffAlertItem,
} from "@/lib/email/templates/staff-order-alert";
import type { Tone } from "@/lib/email/templates/layout";
import { logger } from "@/lib/logger";
import {
  STAFF_EVENTS_KEY,
  STAFF_RECIPIENTS_KEY,
  normaliseEvents,
  resolveStaffRecipients,
} from "./settings";
import { entityOf, eventKeyOf, eventOf, type StaffAlertTrigger } from "./notify";

export type { StaffAlertTrigger } from "./notify";

/**
 * Staff order alerts (087): one email to the staff list per order event.
 *
 * ONE CALL PER EVENT, at the point the audit row is written: `notifyStaff`
 * schedules the work with `after()` so the customer's response never waits on
 * it, and nothing it does can throw into the caller. Outside a request scope
 * (a script, a test) it just runs detached.
 *
 * IDEMPOTENT BY KEY. Each trigger has an event key; `staff_alert_sends` holds
 * it UNIQUE and the caller whose INSERT lands is the one that sends. A Paystack
 * webhook after the browser verify, or a retried request, finds the key and
 * stops. A row is claimed BEFORE anything is loaded or sent, so two
 * concurrent callers cannot both get as far as Resend.
 *
 * SENDING IS PRODUCTION-ONLY, the same gate as the ops alerts: tomame.ca sends,
 * dev.tomame.ca and localhost record the event as `skipped` and log what would
 * have gone out, unless OPS_ALERTS_ENABLED=true. STAFF_ALERT_RECIPIENTS
 * replaces the list when set.
 */

// ── The work ────────────────────────────────────────────────────────────────

export type SendFn = (message: { to: string; subject: string; html: string; text: string }) => Promise<void>;

export interface StaffAlertDeps {
  send: SendFn;
  env: Record<string, string | undefined>;
}

const defaultDeps = (): StaffAlertDeps => ({ send: sendEmail, env: process.env });

export const MAX_SEND_ATTEMPTS = 3;

export type StaffAlertOutcome =
  | { status: "off" }
  | { status: "duplicate" }
  | { status: "skipped"; subject: string }
  | { status: "sent"; subject: string; recipients: number; failed: number }
  | { status: "failed"; error: string };

export async function processStaffAlert(trigger: StaffAlertTrigger, deps: StaffAlertDeps = defaultDeps()): Promise<StaffAlertOutcome> {
  const settings = await readSettings();
  if (!normaliseEvents(settings[STAFF_EVENTS_KEY])[eventOf(trigger)]) return { status: "off" };

  const id = await claimStaffAlertSend({ event_key: eventKeyOf(trigger), event_type: eventOf(trigger), ...entityOf(trigger) });
  if (id === null) return { status: "duplicate" };

  const environment = environmentLabel(deps.env);
  let mail: StaffAlertEmailData;
  try {
    mail = await buildAlert(trigger, environment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishStaffAlertSend(id, { status: "failed", attempts: 0, subject: null, recipients: 0, failed_recipients: 0, error: message.slice(0, 500) });
    logger.error("staff alert: could not build the email", { key: eventKeyOf(trigger), error: message });
    return { status: "failed", error: message };
  }

  const { recipients } = resolveStaffRecipients(deps.env.STAFF_ALERT_RECIPIENTS, settings[STAFF_RECIPIENTS_KEY]);
  if (!alertsEnabled(deps.env)) {
    logger.info("staff alert: would send (disabled on this deployment)", { subject: mail.subject, recipients: recipients.length });
    await finishStaffAlertSend(id, { status: "skipped", attempts: 0, subject: mail.subject, recipients: recipients.length, failed_recipients: 0, error: null });
    return { status: "skipped", subject: mail.subject };
  }

  return deliverAndRecord(id, mail, recipients, deps);
}

async function deliverAndRecord(id: number, mail: StaffAlertEmailData, recipients: string[], deps: StaffAlertDeps): Promise<StaffAlertOutcome> {
  const rendered = staffOrderAlertTemplate(mail);
  const { failed, attempts, lastError } = await deliver(deps.send, recipients, rendered);
  const allFailed = failed === recipients.length;
  await finishStaffAlertSend(id, {
    status: allFailed ? "failed" : "sent",
    attempts,
    subject: rendered.subject,
    recipients: recipients.length,
    failed_recipients: failed,
    error: lastError?.slice(0, 500) ?? null,
  });
  if (allFailed) {
    logger.error("staff alert: reached none of the recipients", { subject: rendered.subject, recipients: recipients.length, error: lastError });
    return { status: "failed", error: lastError ?? "no recipients" };
  }
  if (failed > 0) logger.warn("staff alert: some recipients not reached", { subject: rendered.subject, failed });
  return { status: "sent", subject: rendered.subject, recipients: recipients.length, failed };
}

/** Each recipient gets up to three tries; the result says how many never got it. */
async function deliver(send: SendFn, recipients: string[], mail: { subject: string; html: string; text: string }) {
  let failed = 0;
  let attempts = 0;
  let lastError: string | null = null;
  for (const to of recipients) {
    let ok = false;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS && !ok; attempt++) {
      attempts = Math.max(attempts, attempt);
      try {
        await send({ to, ...mail });
        ok = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!ok) failed += 1;
  }
  if (recipients.length === 0) lastError = "no recipients";
  return { failed: recipients.length === 0 ? 0 : failed, attempts, lastError };
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return await readSiteSettingValues([STAFF_RECIPIENTS_KEY, STAFF_EVENTS_KEY]);
  } catch (error) {
    // Unreadable settings: every event on, the built-in list. Better a mail
    // than silence about an order.
    logger.warn("staff alert: settings unreadable, using defaults", { error: error instanceof Error ? error.message : String(error) });
    return {};
  }
}

// ── The test email ──────────────────────────────────────────────────────────

/**
 * From the admin screen. Goes to the list as currently saved (or the env
 * override). Gated like real alerts: off production it sends only when
 * STAFF_ALERT_RECIPIENTS overrides the list, so dev never mails the
 * production staff. Recorded with its own unique key.
 */
export async function sendStaffTestEmail(requestedBy: string, deps: StaffAlertDeps = defaultDeps()): Promise<StaffAlertOutcome> {
  const settings = await readSettings();
  const { recipients, from } = resolveStaffRecipients(deps.env.STAFF_ALERT_RECIPIENTS, settings[STAFF_RECIPIENTS_KEY]);
  if (!alertsEnabled(deps.env) && from !== "env") {
    return { status: "skipped", subject: "Test emails only send from production (or with STAFF_ALERT_RECIPIENTS set)" };
  }
  const environment = environmentLabel(deps.env);
  const id = await claimStaffAlertSend({
    event_key: `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    event_type: "test",
    entity_type: "site_setting",
    entity_id: STAFF_RECIPIENTS_KEY,
  });
  if (id === null) return { status: "duplicate" };
  return deliverAndRecord(
    id,
    {
      subject: `${prefix(environment)} Test: staff order alerts are working`,
      eyebrow: "Test email",
      tone: "neutral",
      headline: "Staff order alerts reach you",
      summary: `${requestedBy} sent this from the Notifications screen to check the list. Real alerts look like this, with the order, the customer and the money.`,
      customer: null,
      items: [],
      totalGhs: null,
      payment: null,
      facts: [["Recipients", recipients.join(", ")]],
      adminHref: "/admin/notifications",
      adminLabel: "Open Notifications",
      environment,
    },
    recipients,
    deps,
  );
}

// ── What each email says ────────────────────────────────────────────────────

const prefix = (environment: string | null) => (environment ? `[Tomame ${environment}]` : "[Tomame]");
const human = (status: string) => status.replace(/_/g, " ");
const orderTotal = (o: StaffOrderRow) => Number(o.admin_total_ghs ?? o.pricing?.total_ghs ?? 0);
const refOf = (o: StaffOrderRow) => o.order_no ?? `order ${o.id.slice(0, 8)}`;

function orderItem(o: StaffOrderRow): StaffAlertItem {
  return { name: o.product_name, quantity: o.quantity, reference: o.order_no, href: `/admin/orders/${o.id}` };
}

interface Target {
  /** "TM-00042", "TM-00042 (+2)", "Toyota Corolla 2018". */
  reference: string;
  userId: string;
  items: StaffAlertItem[];
  totalGhs: number;
  adminHref: string;
  adminLabel: string;
  paymentId: string | null;
}

async function orderTarget(orderId: string): Promise<Target> {
  const o = await getStaffOrder(orderId);
  if (!o) throw new Error(`order ${orderId} not found`);
  return {
    reference: refOf(o),
    userId: o.user_id,
    items: [orderItem(o)],
    totalGhs: orderTotal(o),
    adminHref: `/admin/orders/${o.id}`,
    adminLabel: "Open the order",
    paymentId: o.payment_id,
  };
}

async function groupTarget(groupId: string): Promise<Target> {
  const [group, orders] = await Promise.all([getStaffGroup(groupId), listStaffOrdersByGroup(groupId)]);
  if (!group) throw new Error(`order group ${groupId} not found`);
  const first = orders[0];
  const firstRef = first ? refOf(first) : `bag ${groupId.slice(0, 8)}`;
  return {
    reference: orders.length > 1 ? `${firstRef} (+${orders.length - 1})` : firstRef,
    userId: group.user_id,
    items: orders.map(orderItem),
    totalGhs: Number(group.total_ghs),
    adminHref: first ? `/admin/orders/${first.id}` : "/admin/bags",
    adminLabel: first ? "Open the first order" : "Open bags",
    paymentId: group.payment_id,
  };
}

async function carTarget(carOrderId: string): Promise<Target & { car: NonNullable<Awaited<ReturnType<typeof getStaffCarOrder>>> }> {
  const car = await getStaffCarOrder(carOrderId);
  if (!car) throw new Error(`car order ${carOrderId} not found`);
  return {
    car,
    reference: car.car_label,
    userId: car.user_id,
    items: [{ name: car.car_label, quantity: 1, reference: null, href: "/admin/cars/orders" }],
    totalGhs: car.price_pesewas / 100,
    adminHref: "/admin/cars/orders",
    adminLabel: "Open car orders",
    paymentId: car.payment_id,
  };
}

async function paymentTarget(p: StaffPaymentRow): Promise<Target> {
  if (p.car_order_id) return carTarget(p.car_order_id);
  if (p.order_group_id) return groupTarget(p.order_group_id);
  const orderId = typeof p.metadata?.order_id === "string" ? p.metadata.order_id : null;
  if (orderId) return orderTarget(orderId);
  return {
    reference: p.reference,
    userId: p.user_id,
    items: [],
    totalGhs: p.amount / 100,
    adminHref: `/admin/transactions/${p.id}`,
    adminLabel: "Open the transaction",
    paymentId: p.id,
  };
}

function paymentInfo(p: StaffPaymentRow | null) {
  return p ? { reference: p.reference, status: p.status, channel: p.channel } : null;
}

async function paymentOf(id: string | null): Promise<StaffPaymentRow | null> {
  if (!id) return null;
  try {
    return await getStaffPayment(id);
  } catch {
    return null;
  }
}

async function customerOf(userId: string) {
  try {
    return await getStaffCustomer(userId);
  } catch {
    return { name: null, email: null, phone: null };
  }
}

const STATUS_TONE: Record<string, Tone> = { delivered: "green", in_transit: "green", processing: "neutral", cancelled: "coral", paid: "green" };

export async function buildAlert(t: StaffAlertTrigger, environment: string | null): Promise<StaffAlertEmailData> {
  const p = prefix(environment);
  const base = (target: Target, payment: StaffPaymentRow | null, customer: Awaited<ReturnType<typeof customerOf>>) => ({
    customer,
    items: target.items,
    totalGhs: target.totalGhs,
    payment: paymentInfo(payment),
    adminHref: target.adminHref,
    adminLabel: target.adminLabel,
    environment,
  });

  switch (t.kind) {
    case "order_placed":
    case "bag_placed": {
      const target = t.kind === "order_placed" ? await orderTarget(t.orderId) : await groupTarget(t.groupId);
      const [customer, payment] = await Promise.all([customerOf(target.userId), paymentOf(target.paymentId)]);
      const order = t.kind === "order_placed" ? await getStaffOrder(t.orderId) : null;
      const review = order?.needs_review ? (order.review_reasons ?? []).join(", ") || "flagged for review" : null;
      const what = t.kind === "bag_placed" ? `bag order of ${target.items.length} item${target.items.length === 1 ? "" : "s"}` : "order";
      return {
        ...base(target, payment, customer),
        subject: `${p} New ${t.kind === "bag_placed" ? "bag order" : "order"} ${target.reference} · ${formatStaffGhs(target.totalGhs)}`,
        eyebrow: "New order",
        tone: review ? "amber" : "coral",
        headline: `New ${what}`,
        summary: `${customer.name ?? customer.email ?? "A customer"} placed ${target.reference}. Not paid yet${review ? "; it needs a review before the customer can pay" : ""}.`,
        facts: review ? [["Needs review", review]] : [],
      };
    }
    case "payment_succeeded":
    case "payment_failed": {
      const payment = await getStaffPayment(t.paymentId);
      if (!payment) throw new Error(`payment ${t.paymentId} not found`);
      const target = await paymentTarget(payment);
      const customer = await customerOf(payment.user_id);
      const amount = payment.amount / 100;
      const ok = t.kind === "payment_succeeded";
      const expired = t.kind === "payment_failed" && t.reason === "expired";
      const recovered = ok && typeof payment.metadata?.recovered_after_expiry_at === "string";
      const label = ok ? "Payment received" : expired ? "Payment abandoned" : "Payment failed";
      return {
        ...base(target, payment, customer),
        totalGhs: amount,
        subject: `${p} ${label} ${target.reference} · ${formatStaffGhs(amount)}`,
        eyebrow: label,
        tone: ok ? "green" : "amber",
        headline: `${label}: ${formatStaffGhs(amount)}`,
        summary: ok
          ? `${customer.name ?? customer.email ?? "A customer"} paid for ${target.reference}. It is ready to buy.`
          : expired
            ? `${customer.name ?? customer.email ?? "A customer"} started paying for ${target.reference} and did not finish. The payment was released; the order stays unpaid.`
            : `Paystack did not confirm the charge for ${target.reference}. The order stays unpaid and the customer can retry.`,
        facts: recovered ? [["Note", "Paid after the payment had been released for inactivity"]] : [],
      };
    }
    case "order_status":
    case "bag_status": {
      const target = t.kind === "order_status" ? await orderTarget(t.orderId) : await groupTarget(t.groupId);
      const order = t.kind === "order_status" ? await getStaffOrder(t.orderId) : null;
      const [customer, payment] = await Promise.all([customerOf(target.userId), paymentOf(target.paymentId)]);
      const facts: [string, string][] = [
        ["From", human(t.from)],
        ["To", human(t.to)],
        ["By", t.by],
      ];
      if (order?.carrier || order?.tracking_number) facts.push(["Tracking", [order.carrier, order.tracking_number].filter(Boolean).join(" ")]);
      return {
        ...base(target, payment, customer),
        subject: `${p} ${t.kind === "bag_status" ? "Bag" : "Order"} ${target.reference} ${human(t.to)}`,
        eyebrow: "Order update",
        tone: STATUS_TONE[t.to] ?? "neutral",
        headline: `${target.reference} is ${human(t.to)}`,
        summary: `${target.reference} for ${customer.name ?? customer.email ?? "a customer"} moved from ${human(t.from)} to ${human(t.to)}.`,
        facts,
      };
    }
    case "package_shipped": {
      const targets = await Promise.all(t.orderIds.map(orderTarget));
      const customers = new Set(targets.map((x) => x.userId)).size;
      return {
        customer: null,
        items: targets.flatMap((x) => x.items),
        totalGhs: targets.reduce((sum, x) => sum + x.totalGhs, 0),
        payment: null,
        adminHref: `/warehouse/packages/${t.packageId}`,
        adminLabel: "Open the package",
        environment,
        subject: `${p} Package ${t.reference} in transit · ${targets.length} order${targets.length === 1 ? "" : "s"}`,
        eyebrow: "Order update",
        tone: STATUS_TONE.in_transit ?? "green",
        headline: `${t.reference} has left the hub`,
        summary: `${targets.length} order${targets.length === 1 ? "" : "s"} for ${customers} customer${customers === 1 ? "" : "s"} moved to in transit.`,
        facts: [["By", t.by]],
      };
    }
    case "order_review": {
      const target = await orderTarget(t.orderId);
      const [customer, payment] = await Promise.all([customerOf(target.userId), paymentOf(target.paymentId)]);
      const label = t.outcome === "approved" ? "Review approved" : t.outcome === "priced" ? "Review priced" : "Review rejected";
      return {
        ...base(target, payment, customer),
        subject: `${p} ${label} ${target.reference} · ${formatStaffGhs(target.totalGhs)}`,
        eyebrow: label,
        tone: t.outcome === "rejected" ? "coral" : "green",
        headline: `${label}: ${target.reference}`,
        summary:
          t.outcome === "rejected"
            ? `An admin rejected ${target.reference}; the order is cancelled.`
            : `An admin cleared ${target.reference}. The customer can now pay ${formatStaffGhs(target.totalGhs)}.`,
        facts: [["Outcome", t.outcome]],
      };
    }
    case "car_order": {
      const target = await carTarget(t.carOrderId);
      const [customer, payment] = await Promise.all([customerOf(target.userId), paymentOf(target.paymentId)]);
      const label = t.action === "created" ? "Car checkout started" : t.action === "cancelled" ? "Car order cancelled" : "Car order released";
      const facts: [string, string][] = [
        ["Deposit", formatStaffGhs(target.car.deposit_pesewas / 100)],
        ["Status", human(target.car.status)],
      ];
      if (target.car.cancel_reason) facts.push(["Reason", target.car.cancel_reason]);
      return {
        ...base(target, payment, customer),
        subject: `${p} ${label}: ${target.reference} · ${formatStaffGhs(target.totalGhs)}`,
        eyebrow: label,
        tone: t.action === "created" ? "coral" : "amber",
        headline: label,
        summary:
          t.action === "created"
            ? `${customer.name ?? customer.email ?? "A customer"} started buying ${target.reference}. The deposit is not paid yet.`
            : `${target.reference} for ${customer.name ?? customer.email ?? "a customer"} was ${t.action}.`,
        facts,
      };
    }
    case "sourcing_requested": {
      const watch = await getStaffSourcingRequest(t.watchId);
      if (!watch) throw new Error(`sourcing request ${t.watchId} not found`);
      const customer = await customerOf(watch.user_id);
      const name = watch.product_name ?? hostLabel(watch.product_url);
      const facts: [string, string][] = [["Link", watch.product_url]];
      if (watch.customer_price_hint_usd != null) facts.push(["Customer's price guess", `$${Number(watch.customer_price_hint_usd).toFixed(2)}`]);
      if (watch.customer_origin_hint) facts.push(["Customer says it ships from", watch.customer_origin_hint]);
      return {
        customer,
        items: [{ name, quantity: 1, reference: null, href: null }],
        totalGhs: null,
        payment: null,
        adminHref: "/admin/sourcing-requests",
        adminLabel: "Open the sourcing queue",
        environment,
        subject: `${p} Sourcing request: ${name.slice(0, 80)}`,
        eyebrow: "Sourcing request",
        tone: "amber",
        headline: "A customer needs this item priced",
        summary: `${customer.name ?? customer.email ?? "A customer"} added an item we cannot price to their bag. They cannot pay for it until a buyer finds it and enters the price.`,
        facts,
      };
    }
    case "assisted_requested": {
      const request = await getStaffAssistedRequest(t.requestId);
      if (!request) throw new Error(`assisted request ${t.requestId} not found`);
      const customer = request.user_id ? await customerOf(request.user_id) : null;
      return {
        customer: { name: customer?.name ?? null, email: customer?.email ?? null, phone: request.phone || customer?.phone || null },
        items: [],
        totalGhs: null,
        payment: null,
        adminHref: "/admin/assisted-requests",
        adminLabel: "Open the assisted queue",
        environment,
        subject: `${p} Buyer request: ${hostLabel(request.product_url)}`,
        eyebrow: "Sourcing request",
        tone: "amber",
        headline: "A customer asked a buyer for help",
        summary: `${customer?.name ?? customer?.email ?? "A visitor"} could not get a price for a link and asked a buyer to reach them on WhatsApp.`,
        facts: [
          ["Link", request.product_url],
          ["What they want", request.description.slice(0, 500)],
        ],
      };
    }
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}
