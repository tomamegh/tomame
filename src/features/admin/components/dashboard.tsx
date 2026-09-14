import Link from "next/link";
import {
  BoxIcon,
  LinkIcon,
  MailIcon,
  MessageCircleIcon,
  ScanSearchIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminStat,
  AdminTableScroller,
} from "@/components/layout/admin";
import type {
  AdminDashboardView,
  DashboardOrderSummary,
  DashboardPaymentSummary,
} from "@/features/admin/admin.service";
import { DashboardChart } from "./dashboard-chart";
import {
  extractionTone,
  formatCount,
  formatCountdown,
  formatDateRange,
  formatGhs,
  formatGhsFloor,
  formatRate,
  formatTimestamp,
  orderStatusLabel,
  orderStatusTone,
  pluralise,
  queueTone,
} from "./dashboard-format";

/**
 * `/admin` — the screen that answers "what needs me right now?".
 *
 * ORDER OF THE PAGE IS THE ARGUMENT. The four queues come first because they
 * are the only figures here that represent a person waiting: a customer whose
 * link could not be read, somebody who wrote in, an order nobody has priced.
 * Money, trend and operations follow as the context those decisions are made
 * in. The previous dashboard opened with four totals and three "latest N"
 * tables and mentioned none of the v2 feature set at all, so an admin could
 * read the whole screen and still not know that three customers were waiting.
 *
 * A SERVER COMPONENT. Everything is handed down already read and already
 * formatted; the only client island is the chart, which needs a toggle. No
 * figure is computed in the browser — pricing least of all (CLAUDE.md).
 *
 * NOTHING STATIC. Every tile and every row traces to a real query. A panel that
 * could not be read says "unavailable" rather than showing a zero, because zero
 * is a claim about the business and a failed read is a claim about the
 * database. A panel that is genuinely empty says so in words, and — for a queue
 * — says it as the good news it is.
 */
export function AdminDashboard({ view }: { view: AdminDashboardView }) {
  const now = new Date(view.generatedAt);
  const range = formatDateRange(view.windowStart, view.windowEnd);

  return (
    <AdminPage
      title="Dashboard"
      blurb="What is waiting on a person, and how the business behind it is doing."
    >
      <DashboardSection
        title="Waiting on a person"
        blurb="Each of these is somebody who has not been answered yet. Open the one with a number on it."
      >
        <QueueTiles view={view} />
      </DashboardSection>

      <DashboardSection title={`Last ${view.windowDays} days`} blurb={range}>
        <MoneyTiles view={view} />
      </DashboardSection>

      <DashboardSection
        title="Operations"
        blurb="The three things that break quietly: links that will not price, bags nobody has paid for, and boxes about to close."
      >
        <OperationsTiles view={view} now={now} />
      </DashboardSection>

      <AdminCard
        title="Activity"
        blurb={`Daily, ${range}. A day with nothing on it plots as zero, not as a gap.`}
        index={2}
      >
        {view.series ? (
          <DashboardChart series={view.series} />
        ) : (
          <AdminEmpty
            title="The trend could not be read"
            body="Orders, payments or pastes did not answer on this load. The figures above are unaffected. Reload to try again."
          />
        )}
      </AdminCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <RecentOrdersCard orders={view.recentOrders} />
        <RecentPaymentsCard payments={view.recentPayments} />
      </div>
    </AdminPage>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

/**
 * A labelled band of tiles.
 *
 * The heading is what makes ten figures readable instead of a wall: an admin
 * scanning the page should be able to stop at "Waiting on a person" without
 * reading the other seven numbers.
 */
function DashboardSection({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[15px] leading-none font-bold text-tm-ink">
          {title}
        </h2>
        {blurb ? (
          <p className="max-w-[72ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
            {blurb}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Four across on a laptop, two on a tablet, one on a phone. */
function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

/**
 * The tile for a panel whose query failed.
 *
 * Muted and dashless on purpose: it must not be mistaken for a real zero, and
 * it must not look like an error the admin caused.
 */
function UnavailableStat({
  label,
  index,
  icon,
}: {
  label: string;
  index: number;
  icon?: React.ReactNode;
}) {
  return (
    <AdminStat
      label={label}
      value="—"
      detail="Could not be read on this load. Reload to try again."
      tone="muted"
      icon={icon}
      index={index}
    />
  );
}

// ── Queues ───────────────────────────────────────────────────────────────────

/**
 * The same four counts the sidebar badges, read from the same query.
 *
 * Deliberately not recomputed here: the old dashboard's "needs review" tile
 * filtered out cancelled and completed orders while the sidebar badge did not,
 * so the two disagreed on the same screen. One source, one number.
 *
 * A zero is rendered as green with a sentence, never left blank — "No one is
 * waiting" is information an admin came here for.
 */
function QueueTiles({ view }: { view: AdminDashboardView }) {
  if (!view.queues) {
    return (
      <TileGrid>
        <UnavailableStat label="Orders to review" index={0} icon={<ScanSearchIcon className="size-4" />} />
        <UnavailableStat label="Assisted requests" index={1} icon={<MessageCircleIcon className="size-4" />} />
        <UnavailableStat label="Contact messages" index={2} icon={<MailIcon className="size-4" />} />
        <UnavailableStat label="Failed pastes" index={3} icon={<LinkIcon className="size-4" />} />
      </TileGrid>
    );
  }

  const { ordersNeedingReview, assistedOpen, contactOpen, pastesFailed } = view.queues;

  return (
    <TileGrid>
      <AdminStat
        label="Orders to review"
        value={formatCount(ordersNeedingReview)}
        detail={
          ordersNeedingReview > 0
            ? "Held until somebody prices or approves them"
            : "Nothing is held back"
        }
        tone={queueTone(ordersNeedingReview)}
        href="/admin/orders"
        icon={<ScanSearchIcon className="size-4" />}
        index={0}
      />
      <AdminStat
        label="Assisted requests"
        value={formatCount(assistedOpen)}
        detail={
          assistedOpen > 0
            ? "Customers promised that a buyer would get back to them"
            : "No one is waiting on a buyer"
        }
        tone={queueTone(assistedOpen)}
        href="/admin/assisted-requests"
        icon={<MessageCircleIcon className="size-4" />}
        index={1}
      />
      <AdminStat
        label="Contact messages"
        value={formatCount(contactOpen)}
        detail={
          contactOpen > 0
            ? "Each sender was told they would hear back within hours"
            : "Everything sent in has been answered"
        }
        tone={queueTone(contactOpen)}
        href="/admin/contact-messages"
        icon={<MailIcon className="size-4" />}
        index={2}
      />
      <AdminStat
        label="Failed pastes"
        value={formatCount(pastesFailed)}
        detail={
          pastesFailed > 0
            ? `Links the extractor gave up on in the last ${view.extractionWindowDays} days`
            : `No link has been given up on in ${view.extractionWindowDays} days`
        }
        tone={queueTone(pastesFailed)}
        href="/admin/pastes"
        icon={<LinkIcon className="size-4" />}
        index={3}
      />
    </TileGrid>
  );
}

// ── Money ────────────────────────────────────────────────────────────────────

/**
 * Settled money and what produced it.
 *
 * "Settled revenue" is the sum of `payments` that reached `success` — the only
 * record of money that actually arrived. The figure it replaces added up order
 * totals for every order an admin had moved past `pending`, which counted
 * charges nobody had made and missed the group-level delivery fee entirely.
 *
 * "Customers who ordered" states its own definition on the tile. Its
 * predecessor was called "Active users" and defined nowhere.
 */
function MoneyTiles({ view }: { view: AdminDashboardView }) {
  const { money, orders, customers } = view;

  return (
    <TileGrid>
      {money ? (
        <AdminStat
          label="Settled revenue"
          value={formatGhsFloor(money.settledGhs, money.truncated)}
          detail={
            money.paymentCount > 0
              ? `${pluralise(money.paymentCount, "payment")} Paystack confirmed`
              : "No payment has settled in this window"
          }
          tone={money.settledGhs > 0 ? "green" : "muted"}
          href="/admin/transactions"
          icon={<WalletIcon className="size-4" />}
          index={0}
        />
      ) : (
        <UnavailableStat label="Settled revenue" index={0} icon={<WalletIcon className="size-4" />} />
      )}

      {money ? (
        <AdminStat
          label="Average payment"
          value={money.averagePaymentGhs == null ? "—" : formatGhs(money.averagePaymentGhs)}
          detail={
            money.averagePaymentGhs == null
              ? "Needs at least one settled payment"
              : "Mean settled charge. One payment can buy a whole bag"
          }
          tone={money.averagePaymentGhs == null ? "muted" : "neutral"}
          index={1}
        />
      ) : (
        <UnavailableStat label="Average payment" index={1} />
      )}

      {orders ? (
        <AdminStat
          label="Orders placed"
          value={formatCount(orders.placed)}
          detail={[
            orders.cancelled > 0 ? `${formatCount(orders.cancelled)} cancelled` : null,
            orders.allTime == null ? null : `${formatCount(orders.allTime)} all time`,
          ]
            .filter(Boolean)
            .join(" · ")}
          tone={orders.placed > 0 ? "neutral" : "muted"}
          href="/admin/orders"
          icon={<ShoppingCartIcon className="size-4" />}
          index={2}
        />
      ) : (
        <UnavailableStat label="Orders placed" index={2} icon={<ShoppingCartIcon className="size-4" />} />
      )}

      {customers ? (
        <AdminStat
          label="Customers who ordered"
          value={formatCount(customers.ordering)}
          detail={[
            `At least one order in ${view.windowDays} days`,
            customers.registered == null
              ? null
              : `${formatCount(customers.registered)} registered`,
          ]
            .filter(Boolean)
            .join(" · ")}
          tone={customers.ordering > 0 ? "neutral" : "muted"}
          href="/admin/users"
          icon={<UsersRoundIcon className="size-4" />}
          index={3}
        />
      ) : (
        <UnavailableStat label="Customers who ordered" index={3} icon={<UsersRoundIcon className="size-4" />} />
      )}
    </TileGrid>
  );
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * The three v2 signals nothing reported before.
 *
 * Extraction health is first because a link that will not price is the failure
 * a customer sees. Bags are the best leading indicator of demand the platform
 * has — they exist before any money does — and a box cutoff is a deadline with
 * freight money attached to missing it.
 */
function OperationsTiles({ view, now }: { view: AdminDashboardView; now: Date }) {
  const { extraction, bags, boxes } = view;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {extraction ? (
        <AdminStat
          label="Links that priced"
          value={formatRate(extraction.successRate)}
          detail={
            extraction.successRate == null
              ? `No paste has finished in ${view.extractionWindowDays} days`
              : [
                  `${formatCount(extraction.ready)} of ${formatCount(
                    extraction.ready + extraction.failed,
                  )} finished pastes, ${view.extractionWindowDays} days`,
                  extraction.working > 0
                    ? `${formatCount(extraction.working)} still reading`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
          tone={extractionTone(extraction.successRate)}
          href="/admin/pastes"
          icon={<LinkIcon className="size-4" />}
          index={0}
        />
      ) : (
        <UnavailableStat label="Links that priced" index={0} icon={<LinkIcon className="size-4" />} />
      )}

      {bags ? (
        <AdminStat
          label="Bags in flight"
          value={formatCount(bags.bags)}
          detail={
            bags.bags === 0
              ? "No open bag has anything in it"
              : [
                  `${pluralise(bags.items, "item")} · ${formatGhs(bags.valueGhs)} at bag prices`,
                  bags.unpricedLines > 0
                    ? `${formatCount(bags.unpricedLines)} still being read`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
          tone={bags.bags > 0 ? "coral" : "muted"}
          href="/admin/bags"
          icon={<ShoppingBagIcon className="size-4" />}
          index={1}
        />
      ) : (
        <UnavailableStat label="Bags in flight" index={1} icon={<ShoppingBagIcon className="size-4" />} />
      )}

      {boxes ? (
        <AdminStat
          label="Boxes near cutoff"
          value={formatCount(boxes.count)}
          detail={
            boxes.soonest
              ? `${boxes.soonest.label} closes ${formatCountdown(boxes.soonest.cutoffAt, now)}`
              : `Nothing closes in the next ${view.boxCutoffWindowHours} hours`
          }
          tone={boxes.count > 0 ? "amber" : "green"}
          href="/admin/boxes"
          icon={<BoxIcon className="size-4" />}
          index={2}
        />
      ) : (
        <UnavailableStat label="Boxes near cutoff" index={2} icon={<BoxIcon className="size-4" />} />
      )}
    </div>
  );
}

// ── Recent activity ──────────────────────────────────────────────────────────

/**
 * The last handful of orders.
 *
 * The old dashboard carried three of these tables — orders, deliveries and
 * transactions — and the deliveries one was a second view of the same orders,
 * filtered by status. `/admin/deliveries` owns that question properly, so the
 * dashboard keeps the two lists that are genuinely different from each other:
 * what was ordered, and what was paid.
 */
function RecentOrdersCard({ orders }: { orders: DashboardOrderSummary[] | null }) {
  return (
    <AdminCard
      title="Latest orders"
      blurb="Newest first, whatever their state."
      action={
        <Link
          href="/admin/orders"
          className="text-[13px] leading-none font-semibold text-tm-coral-strong hover:underline"
        >
          All orders
        </Link>
      }
      flush
      index={3}
    >
      {orders == null ? (
        <div className="p-5">
          <AdminEmpty
            title="Orders could not be read"
            body="This list did not answer on the current load. Reload to try again."
          />
        </div>
      ) : orders.length === 0 ? (
        <div className="p-5">
          <AdminEmpty
            title="No orders yet"
            body="The first order a customer places will appear here, with whatever it is waiting on."
          />
        </div>
      ) : (
        <AdminTableScroller>
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={ADMIN_TH}>Product</th>
                <th className={ADMIN_TH}>Status</th>
                <th className={`${ADMIN_TH} text-right`}>Total</th>
                <th className={ADMIN_TH}>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className={ADMIN_TR}>
                  <td className={ADMIN_TD}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex flex-col gap-0.5 font-semibold hover:text-tm-coral-strong"
                    >
                      <span className="line-clamp-1 max-w-[26ch]">{order.productName}</span>
                      <span className="tm-nums text-[12px] font-medium text-tm-text-3">
                        {order.originCountry} · ×{formatCount(order.quantity)}
                      </span>
                    </Link>
                  </td>
                  <td className={ADMIN_TD}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AdminBadge tone={orderStatusTone(order.status)}>
                        {orderStatusLabel(order.status)}
                      </AdminBadge>
                      {order.needsReview ? (
                        <AdminBadge tone="amber">Review</AdminBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className={`${ADMIN_TD} tm-nums text-right font-semibold`}>
                    {order.totalGhs == null ? (
                      <span className="text-tm-text-3">Not priced</span>
                    ) : (
                      <span title={order.totalIsAdminPriced ? "Admin re-price" : "Quoted total"}>
                        {formatGhs(order.totalGhs)}
                        {order.totalIsAdminPriced ? (
                          <span className="ml-1 text-[11px] font-semibold text-tm-text-3">
                            adj
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                    {formatTimestamp(order.createdAt) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableScroller>
      )}
    </AdminCard>
  );
}

/**
 * Money that arrived, and nothing else.
 *
 * Successes only: a failed or pending charge belongs on `/admin/transactions`
 * where it can be read next to its retries. On a card headed "Money in" it
 * would read as income.
 */
function RecentPaymentsCard({ payments }: { payments: DashboardPaymentSummary[] | null }) {
  return (
    <AdminCard
      title="Money in"
      blurb="Settled payments only: charges Paystack confirmed."
      action={
        <Link
          href="/admin/transactions"
          className="text-[13px] leading-none font-semibold text-tm-coral-strong hover:underline"
        >
          All transactions
        </Link>
      }
      flush
      index={4}
    >
      {payments == null ? (
        <div className="p-5">
          <AdminEmpty
            title="Payments could not be read"
            body="This list did not answer on the current load. Reload to try again."
          />
        </div>
      ) : payments.length === 0 ? (
        <div className="p-5">
          <AdminEmpty
            title="Nothing has settled yet"
            body="A confirmed Mobile Money or card charge will appear here the moment Paystack verifies it."
          />
        </div>
      ) : (
        <AdminTableScroller>
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className={ADMIN_TH}>Reference</th>
                <th className={`${ADMIN_TH} text-right`}>Amount</th>
                <th className={ADMIN_TH}>Settled</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className={ADMIN_TR}>
                  <td className={ADMIN_TD}>
                    <Link
                      href={`/admin/transactions/${payment.id}`}
                      className="tm-nums font-semibold hover:text-tm-coral-strong"
                    >
                      {payment.reference}
                    </Link>
                  </td>
                  <td className={`${ADMIN_TD} tm-nums text-right font-semibold text-tm-green`}>
                    {formatGhs(payment.amountGhs)}
                  </td>
                  <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                    {formatTimestamp(payment.createdAt) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableScroller>
      )}
    </AdminCard>
  );
}
