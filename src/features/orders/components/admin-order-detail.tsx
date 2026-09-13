import Link from "next/link";

import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  type AdminTone,
} from "@/components/layout/admin/admin-page";
import type { AdminOrderCustomer, AdminPaymentRow } from "@/db/queries/admin-orders";
import type { OrderEventRow } from "@/db/queries/order-events";
import type { OrderGroupRow } from "@/db/queries/order-groups";
import { paidRows } from "@/features/journeys/format";
import { formatGhs, formatPercent, formatUsd } from "@/features/marketing/format";
import type { AuditLog } from "@/features/audit/types";
import type { OrderDelivery } from "@/features/deliveries/types";
import { cn } from "@/lib/utils";
import { describeJourney, JOURNEY_STOPS } from "../services/journey-stage";
import type { Order } from "../types";
import {
  formatAdminDate,
  formatAdminDateTime,
  orderEtaDisplay,
  orderTotalDisplay,
} from "./admin-order-display";
import { adminStatusLabel, adminStatusTone } from "./admin-transitions";

/**
 * `/admin/orders/[id]` — everything about one order, on one screen.
 *
 * A SERVER COMPONENT. The screen this replaces was a 950-line client island on
 * the pre-redesign stone palette that fetched the order, the audit log and the
 * customer through three react-query hooks, rendered its own six-status timeline
 * from a hardcoded list of labels, and could do exactly one thing: review a
 * flagged order. It could not move an order through the state machine, could not
 * show the extraction snapshot the price came from, and had no idea the delivery
 * ETA had become a window.
 *
 * Everything here is read from a row. Nothing is derived, estimated or
 * recomputed: `journey-stage.ts` supplies the customer's word for a status,
 * `paidRows` reads the STORED breakdown, and the two logs are printed as they
 * were written. The only interactive parts are the two client islands — the
 * review decision and the state-machine controls.
 */

export interface AdminOrderDetailProps {
  order: Order;
  customer: AdminOrderCustomer | null;
  payment: AdminPaymentRow | null;
  delivery: OrderDelivery | null;
  group: OrderGroupRow | null;
  siblings: Order[];
  events: OrderEventRow[];
  auditLogs: AuditLog[];
}

export function AdminOrderDetail({
  order,
  customer,
  payment,
  delivery,
  group,
  siblings,
  events,
  auditLogs,
}: AdminOrderDetailProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex flex-col gap-5">
        <JourneyCard order={order} index={0} />
        <ProductCard order={order} index={1} />
        <TimelineCard events={events} auditLogs={auditLogs} index={2} />
      </div>

      <div className="flex flex-col gap-5">
        <PricingCard order={order} index={0} />
        <CustomerCard customer={customer} index={1} />
        <PaymentCard payment={payment} group={group} index={2} />
        <DeliveryCard order={order} delivery={delivery} group={group} index={3} />
        {group ? <BagCard group={group} siblings={siblings} index={4} /> : null}
      </div>
    </div>
  );
}

// ── Journey ─────────────────────────────────────────────────────────────────

/**
 * The five-stop track, drawn from `describeJourney` — the SAME derivation the
 * customer's journey screen uses.
 *
 * Reused rather than reimplemented on purpose: an admin ringing a customer must
 * be looking at the stop the customer is looking at. The track is a stage
 * position, not progress through time (see `journey-stage.ts`), so nothing here
 * interpolates a percentage from a date.
 */
function JourneyCard({ order, index }: { order: Order; index: number }) {
  const journey = describeJourney({
    status: order.status,
    estimatedDeliveryDate: order.estimated_delivery_date,
  });
  const eta = orderEtaDisplay(order);
  const litIndex = JOURNEY_STOPS.findIndex((stop) => stop.key === journey.stopKey);

  return (
    <AdminCard
      index={index}
      title="Where it is"
      blurb="Exactly what the customer sees on their own journey screen."
      action={<AdminBadge tone={adminStatusTone(order.status)}>{journey.label}</AdminBadge>}
    >
      <div className="flex flex-col gap-5">
        {journey.isCancelled ? (
          <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
            This order is off the track entirely. Nothing further will happen to it.
          </p>
        ) : (
          <ol className="flex items-start justify-between gap-1">
            {JOURNEY_STOPS.map((stop, position) => {
              const reached = litIndex >= 0 && position <= litIndex;
              const current = position === litIndex;
              return (
                <li key={stop.key} className="flex flex-1 flex-col items-center gap-2 text-center">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-full",
                      current
                        ? "bg-tm-coral ring-4 ring-tm-pill-bg"
                        : reached
                          ? "bg-tm-green"
                          : "bg-tm-border",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[11.5px] leading-[1.3] font-semibold",
                      current ? "text-tm-ink" : reached ? "text-tm-text-2" : "text-tm-text-3",
                    )}
                  >
                    {stop.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <dl className="grid grid-cols-2 gap-4 border-t border-tm-hairline pt-4">
          <Fact
            label="Delivery window"
            value={eta}
            // `hint` is the journey's own copy for "no date yet" — "Date set when
            // it ships", not an invented date.
            fallback={journey.hint}
            tone={eta ? "neutral" : "muted"}
          />
          <Fact
            label="Delivered"
            value={formatAdminDateTime(order.delivered_at)}
            fallback="Not yet"
            tone={order.delivered_at ? "green" : "muted"}
          />
        </dl>
      </div>
    </AdminCard>
  );
}

// ── Product and the snapshot it was priced from ─────────────────────────────

/**
 * The product, and the extraction snapshot the order was priced from.
 *
 * `orders.extraction_metadata` is the server-side snapshot
 * (`order-intake.service.ts` copies it off `extraction_cache` at order
 * creation), and it is the evidence behind every figure on the pricing card. An
 * admin arguing with a customer about a price needs to see what the machine
 * actually read off the page — including what it could NOT read, which is what
 * `messages` holds and what usually explains a `needs_review` flag.
 */
function ProductCard({ order, index }: { order: Order; index: number }) {
  const snapshot = order.extraction_metadata;
  const product = snapshot?.product;

  return (
    <AdminCard
      index={index}
      title="What was bought"
      blurb="The product, and the snapshot the price was struck from."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[15px] leading-[1.35] font-semibold text-tm-ink">
            {order.product_name}
          </h3>
          <a
            href={order.product_url}
            target="_blank"
            rel="noreferrer noopener"
            className="line-clamp-1 max-w-full text-[12.5px] font-medium break-all text-tm-coral-strong hover:underline"
          >
            {order.product_url}
          </a>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label="Quantity" value={String(order.quantity)} />
          <Fact label="Buying from" value={order.origin_country} />
          <Fact
            label="Listed price"
            value={
              order.estimated_price_usd != null ? formatUsd(order.estimated_price_usd) : null
            }
            fallback="Not recorded"
          />
          <Fact label="Category" value={product?.category ?? null} fallback="Not read" />
          <Fact label="Brand" value={product?.brand ?? null} fallback="Not read" />
          <Fact
            label="Weight"
            value={product?.weight_lbs != null ? `${product.weight_lbs} lb` : null}
            fallback="Not listed"
          />
          <Fact label="Seller" value={product?.seller ?? null} fallback="Not read" />
          <Fact label="Condition" value={product?.condition ?? null} fallback="Not read" />
          <Fact label="Availability" value={product?.availability ?? null} fallback="Not read" />
        </dl>

        {order.special_instructions ? (
          <div className="rounded-[14px] bg-tm-paper px-4 py-3">
            <p className="mb-1 text-[11.5px] leading-none font-semibold text-tm-text-2">
              Customer's note
            </p>
            <p className="text-[13px] leading-[1.5] font-medium text-tm-ink">
              {order.special_instructions}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-tm-hairline pt-4">
          <p className="text-[11.5px] leading-none font-semibold text-tm-text-2">
            Extraction snapshot
          </p>
          {snapshot ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <AdminBadge tone={snapshot.extraction_success ? "green" : "amber"}>
                  {snapshot.extraction_success ? "Read cleanly" : "Partly read"}
                </AdminBadge>
                {snapshot.platform ? (
                  <AdminBadge tone="muted">{snapshot.platform}</AdminBadge>
                ) : null}
                {snapshot.source ? (
                  <AdminBadge tone="muted">via {snapshot.source}</AdminBadge>
                ) : null}
                {snapshot.fetched_at ? (
                  <span className="tm-nums text-[11.5px] font-medium text-tm-text-3">
                    read {formatAdminDateTime(snapshot.fetched_at)}
                  </span>
                ) : null}
              </div>
              {snapshot.messages?.length ? (
                <ul className="flex flex-col gap-1">
                  {snapshot.messages.map((message) => (
                    <li
                      key={message}
                      className="text-[12.5px] leading-[1.5] font-medium text-tm-text-2"
                    >
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
              No snapshot was stored with this order. It predates the snapshot
              column, or the price came from the customer rather than the listing.
            </p>
          )}
        </div>
      </div>
    </AdminCard>
  );
}

// ── Pricing ─────────────────────────────────────────────────────────────────

/**
 * The stored breakdown, line by line.
 *
 * `paidRows` is the customer's receipt, reused verbatim so the two screens can
 * never print different numbers for the same order. Under it are the admin-only
 * facts — which rule priced it, and what the engine wrote down while doing so.
 *
 * NOTHING IS CALCULATED HERE, including the total: `orderTotalDisplay` picks
 * between the hand-set override and the stored figure and formats the one it
 * picked.
 */
function PricingCard({ order, index }: { order: Order; index: number }) {
  const total = orderTotalDisplay(order);
  const pricing = order.pricing;

  return (
    <AdminCard index={index} title="What it cost">
      {pricing ? (
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2">
            {paidRows(pricing).map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-3">
                <dt
                  className={cn(
                    "text-[12.5px] font-medium",
                    row.tone === "muted" ? "text-tm-text-3" : "text-tm-text-2",
                  )}
                >
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "tm-nums text-[12.5px] font-semibold",
                    row.tone === "muted" ? "text-tm-text-3" : "text-tm-ink",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex items-baseline justify-between gap-3 border-t border-tm-hairline pt-3">
            <span className="text-[13px] font-bold text-tm-ink">Total</span>
            <span
              className={cn(
                "tm-nums font-display text-[20px] leading-none font-bold",
                total.isUnpriced ? "text-tm-amber" : "text-tm-ink",
              )}
            >
              {total.text}
            </span>
          </div>

          {total.isOverride ? (
            <div className="rounded-[14px] bg-tm-amber-bg px-4 py-3">
              <p className="text-[12.5px] leading-[1.5] font-semibold text-[#7a4a06]">
                Priced by hand — this overrides the breakdown above.
              </p>
              {order.admin_pricing_note ? (
                <p className="mt-1 text-[12.5px] leading-[1.5] font-medium text-[#7a4a06]">
                  {order.admin_pricing_note}
                </p>
              ) : null}
              {order.pricing_set_at ? (
                <p className="tm-nums mt-1 text-[11.5px] font-medium text-[#7a4a06]">
                  Set {formatAdminDateTime(order.pricing_set_at)}
                </p>
              ) : null}
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-4 border-t border-tm-hairline pt-4">
            <Fact label="Rule" value={pricing.pricing_method} />
            <Fact label="Group" value={pricing.pricing_group} fallback="—" />
            {pricing.weight_lbs != null ? (
              <Fact
                label="Charged weight"
                value={`${pricing.weight_lbs} lb`}
                hint={pricing.weight_source ?? undefined}
              />
            ) : null}
            {pricing.rate_locked_until ? (
              <Fact
                label="Rate locked until"
                value={formatAdminDateTime(pricing.rate_locked_until)}
              />
            ) : null}
          </dl>

          {pricing.fee_calculation_note ? (
            <p className="rounded-[14px] bg-tm-paper px-4 py-3 text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
              {pricing.fee_calculation_note}
            </p>
          ) : null}

          {pricing.mid_market_rate ? (
            <p className="tm-nums text-[11.5px] font-medium text-tm-text-3">
              Mid-market {pricing.mid_market_rate.toFixed(2)}, charged at{" "}
              {pricing.exchange_rate.toFixed(2)} (
              {formatPercent(pricing.exchange_rate / pricing.mid_market_rate - 1)} buffer).
            </p>
          ) : null}
        </div>
      ) : (
        <AdminEmpty
          title="No breakdown stored"
          body="This order carries no pricing row at all. It cannot be paid for until somebody sets a price."
        />
      )}
    </AdminCard>
  );
}

// ── Customer, payment, delivery, bag ────────────────────────────────────────

function CustomerCard({
  customer,
  index,
}: {
  customer: AdminOrderCustomer | null;
  index: number;
}) {
  return (
    <AdminCard index={index} title="Customer">
      {customer ? (
        <dl className="flex flex-col gap-3">
          <Fact label="Name" value={customer.name} fallback="Not given" />
          <Fact label="Email" value={customer.email} fallback="Not on file" />
          <Fact label="Phone" value={customer.phone} fallback="Not given" />
          <Fact
            label="Customer since"
            value={formatAdminDate(customer.created_at)}
            fallback="—"
          />
          <Link
            href={`/admin/users/${customer.id}`}
            className="text-[12.5px] font-semibold text-tm-coral-strong hover:underline"
          >
            Open their account
          </Link>
        </dl>
      ) : (
        <AdminEmpty
          title="No profile"
          body="The account behind this order could not be read. It may have been deleted."
        />
      )}
    </AdminCard>
  );
}

/**
 * The payment.
 *
 * Pesewas are converted to cedis for display only — `amount / 100` is the unit
 * change Paystack's own field implies, not a price calculation. When the order
 * belongs to a bag, the group's total is shown beside it, because the payment
 * covers every order in the group and reading it as this order's price would be
 * wrong.
 */
function PaymentCard({
  payment,
  group,
  index,
}: {
  payment: AdminPaymentRow | null;
  group: OrderGroupRow | null;
  index: number;
}) {
  return (
    <AdminCard index={index} title="Payment">
      {payment ? (
        <dl className="flex flex-col gap-3">
          <Fact
            label="Status"
            value={PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
            tone={PAYMENT_STATUS_TONE[payment.status] ?? "neutral"}
          />
          <Fact label="Amount charged" value={formatGhs(payment.amount / 100)} />
          <Fact label="Channel" value={payment.channel} fallback="Not recorded" />
          <Fact label="Reference" value={payment.reference} />
          <Fact label="Taken" value={formatAdminDateTime(payment.created_at)} fallback="—" />
          {group ? (
            <Fact
              label="Covers"
              value={`${group.item_count} ${group.item_count === 1 ? "order" : "orders"} · ${formatGhs(group.total_ghs)}`}
              hint="One payment for the whole bag"
            />
          ) : null}
        </dl>
      ) : (
        <AdminEmpty
          title="Nothing paid yet"
          body="No payment row points at this order. It has not been paid for, or the attempt never reached Paystack."
        />
      )}
    </AdminCard>
  );
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Started, not confirmed",
  success: "Paid",
  failed: "Failed",
};

const PAYMENT_STATUS_TONE: Record<string, AdminTone> = {
  pending: "amber",
  success: "green",
  failed: "coral",
};

/**
 * Where it is going, and what the 017 row says about getting it there.
 *
 * The address is the CHECKOUT SNAPSHOT on `order_groups.delivery_address`, never
 * the customer's current address book — a customer who moves house must not
 * change where a shipped order was sent.
 */
function DeliveryCard({
  order,
  delivery,
  group,
  index,
}: {
  order: Order;
  delivery: OrderDelivery | null;
  group: OrderGroupRow | null;
  index: number;
}) {
  const address = group?.delivery_address ?? null;
  const lines = address ? addressLines(address) : [];

  return (
    <AdminCard index={index} title="Delivery">
      <div className="flex flex-col gap-4">
        {lines.length > 0 ? (
          <div>
            <p className="mb-1 text-[11.5px] leading-none font-semibold text-tm-text-2">
              Deliver to
            </p>
            <address className="text-[13px] leading-[1.5] font-medium text-tm-ink not-italic">
              {lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>
        ) : (
          <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
            No address was snapshotted with this order. It was placed before the
            bag existed, so the address was never captured at checkout.
          </p>
        )}

        <dl className="flex flex-col gap-3 border-t border-tm-hairline pt-4">
          <Fact label="Carrier" value={order.carrier} fallback="Not set" />
          <Fact label="Tracking number" value={order.tracking_number} fallback="Not set" />
          {delivery?.tracking_url ? (
            <div className="flex flex-col gap-1">
              <dt className="text-[11.5px] leading-none font-semibold text-tm-text-2">
                Tracking link
              </dt>
              <dd>
                <a
                  href={delivery.tracking_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[12.5px] font-semibold break-all text-tm-coral-strong hover:underline"
                >
                  Open with the carrier
                </a>
              </dd>
            </div>
          ) : null}
          {delivery?.notes ? <Fact label="Operator's note" value={delivery.notes} /> : null}
        </dl>

        {!delivery ? (
          <p className="text-[11.5px] leading-[1.5] font-medium text-tm-text-3">
            No `order_deliveries` row exists for this order. Every upsert into
            that table failed silently until migration 050 added the unique index
            it needed, so orders that shipped before then have their carrier on
            the order and nothing here. Setting the delivery window will create
            one.
          </p>
        ) : null}
      </div>
    </AdminCard>
  );
}

/**
 * A checkout address snapshot is JSONB, so its shape is whatever checkout wrote.
 * Read defensively, field by field — a missing line is simply not printed rather
 * than rendering "undefined" into an address.
 */
function addressLines(address: Record<string, unknown>): string[] {
  const get = (key: string): string | null => {
    const value = address[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return [
    get("recipient_name"),
    get("phone"),
    get("line1"),
    get("line2"),
    [get("area"), get("city")].filter(Boolean).join(", ") || null,
    get("region"),
    get("digital_address"),
  ].filter((line): line is string => !!line);
}

/** The rest of the bag this order was bought with (048). */
function BagCard({
  group,
  siblings,
  index,
}: {
  group: OrderGroupRow;
  siblings: Order[];
  index: number;
}) {
  return (
    <AdminCard
      index={index}
      title="Bought with"
      blurb={`One payment of ${formatGhs(group.total_ghs)} covered ${group.item_count} ${group.item_count === 1 ? "order" : "orders"}.`}
    >
      {siblings.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {siblings.map((sibling) => (
            <li key={sibling.id}>
              <Link
                href={`/admin/orders/${sibling.id}`}
                className="flex items-start justify-between gap-3 rounded-[12px] px-2 py-1.5 -mx-2 transition-colors hover:bg-tm-paper"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="tm-nums text-[12.5px] leading-none font-bold text-tm-ink">
                    {sibling.order_no}
                  </span>
                  <span className="line-clamp-1 max-w-[22ch] text-[12px] leading-[1.35] font-medium text-tm-text-2">
                    {sibling.product_name}
                  </span>
                </span>
                <AdminBadge tone={adminStatusTone(sibling.status)}>
                  {adminStatusLabel(sibling.status)}
                </AdminBadge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
          This was the only order in its bag.
        </p>
      )}

      <dl className="mt-4 flex flex-col gap-3 border-t border-tm-hairline pt-4">
        {group.consolidation_saving_ghs > 0 ? (
          <Fact
            label="Consolidation saving"
            value={`− ${formatGhs(group.consolidation_saving_ghs)}`}
            tone="green"
          />
        ) : null}
        {group.delivery_fee_ghs > 0 ? (
          <Fact label="Delivery fee" value={formatGhs(group.delivery_fee_ghs)} />
        ) : null}
        <Fact label="Bag total" value={formatGhs(group.total_ghs)} />
      </dl>
    </AdminCard>
  );
}

// ── The two logs ────────────────────────────────────────────────────────────

/**
 * Both histories, side by side.
 *
 * They are NOT the same log and the screen says so. `order_events` (050) is the
 * customer's narrative — human wording, and only the visible rows ever reach
 * them. `audit_logs` (002) is the compliance record: machine-worded,
 * append-only, admin-only. Migration 050 explains at length why two tables
 * rather than one, and an admin investigating a complaint needs both.
 */
function TimelineCard({
  events,
  auditLogs,
  index,
}: {
  events: OrderEventRow[];
  auditLogs: AuditLog[];
  index: number;
}) {
  return (
    <AdminCard
      index={index}
      title="History"
      blurb="What the customer was told, and what the system recorded."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="text-[11.5px] leading-none font-semibold tracking-wide text-tm-text-2 uppercase">
            Customer updates
          </h3>
          {events.length > 0 ? (
            <ol className="flex flex-col gap-3.5">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-[6px] size-2 shrink-0 rounded-full bg-tm-coral"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] leading-[1.35] font-semibold text-tm-ink">
                      {event.title}
                    </span>
                    {event.detail ? (
                      <span className="text-[12px] leading-[1.4] font-medium text-tm-text-2">
                        {event.detail}
                      </span>
                    ) : null}
                    <span className="tm-nums text-[11.5px] font-medium text-tm-text-3">
                      {formatAdminDateTime(event.occurred_at)}
                      {event.location ? ` · ${event.location}` : ""}
                      {event.weight_lbs != null ? ` · ${event.weight_lbs} lb` : ""}
                      {event.is_customer_visible ? "" : " · internal"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
              Nothing has been said to the customer about this order yet.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-[11.5px] leading-none font-semibold tracking-wide text-tm-text-2 uppercase">
            Audit log
          </h3>
          {auditLogs.length > 0 ? (
            <ol className="flex flex-col gap-3.5">
              {[...auditLogs].reverse().map((log) => (
                <li key={log.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-[6px] size-2 shrink-0 rounded-full bg-tm-border"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] leading-[1.35] font-semibold text-tm-ink">
                      {log.action}
                    </span>
                    <span className="tm-nums text-[11.5px] font-medium text-tm-text-3">
                      {formatAdminDateTime(log.created_at)} · {log.actor_role}
                    </span>
                    {auditSummary(log) ? (
                      <span className="text-[12px] leading-[1.4] font-medium text-tm-text-2">
                        {auditSummary(log)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
              No audit rows for this order.
            </p>
          )}
        </section>
      </div>
    </AdminCard>
  );
}

/**
 * One readable line out of an audit row's metadata.
 *
 * Only the two shapes that actually carry meaning to a human — a status
 * transition and a hand-set price. Everything else is left to the action name
 * rather than dumped as JSON, which is noise in a column this narrow.
 */
function auditSummary(log: AuditLog): string | null {
  const metadata = log.metadata ?? {};
  const from = typeof metadata.from === "string" ? metadata.from : null;
  const to = typeof metadata.to === "string" ? metadata.to : null;
  if (from && to) return `${from} → ${to}`;

  const total = metadata.admin_total_ghs;
  if (typeof total === "number") return `Priced at ${formatGhs(total)}`;

  return null;
}

// ── A labelled fact ─────────────────────────────────────────────────────────

/**
 * One `<dt>/<dd>` pair.
 *
 * `fallback` is required thinking, not a convenience: every caller has to say
 * what an absent value means ("Not set", "Not read", "Not yet"), because the
 * alternative — an empty cell — reads as a rendering bug rather than as a fact
 * about the order.
 */
function Fact({
  label,
  value,
  fallback,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | null | undefined;
  fallback?: string;
  hint?: string;
  tone?: AdminTone;
}) {
  const missing = !value;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11.5px] leading-none font-semibold text-tm-text-2">{label}</dt>
      <dd
        className={cn(
          "tm-nums text-[13px] leading-[1.35] font-semibold break-words",
          missing
            ? "text-tm-text-3"
            : tone === "green"
              ? "text-tm-green"
              : tone === "amber"
                ? "text-tm-amber"
                : tone === "coral"
                  ? "text-tm-coral-strong"
                  : tone === "muted"
                    ? "text-tm-text-3"
                    : "text-tm-ink",
        )}
      >
        {value ?? fallback ?? "—"}
      </dd>
      {hint ? (
        <span className="text-[11px] leading-[1.3] font-medium text-tm-text-3">{hint}</span>
      ) : null}
    </div>
  );
}
