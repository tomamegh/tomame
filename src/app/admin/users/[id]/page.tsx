import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPage,
} from "@/components/layout/admin";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { getUserDetail } from "@/features/users/services/users.service";
import { AdminPasswordReset } from "@/features/users/components/admin-password-reset";
import { AdminRoleControl } from "@/features/users/components/admin-role-control";
import {
  contactChannelsLabel,
  formatJoined,
  roleBadge,
  userDisplayName,
  userInitials,
} from "@/features/users/components/admin-user-format";
import {
  notificationEventLabel,
  notificationStatusBadge,
  relativeTime,
} from "@/features/notifications/components/admin-notification-format";
import {
  getOpenBagForUser,
  getUserPreferences,
  listWatchesForUser,
} from "@/db/queries/admin-people";
import { listNotificationsForAdmin } from "@/db/queries/admin-notifications";
import { listDeliveryAddresses } from "@/db/queries/delivery-addresses";
import { formatAddressLabel } from "@/features/addresses/format";
import {
  formatCount,
  orderStatusLabel,
  orderStatusTone,
} from "@/features/admin/components/dashboard-format";
import { formatGhs, formatUsd } from "@/features/marketing/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/auth/admin-access";

/**
 * `/admin/users/[id]` — one customer, whole.
 *
 * A server component that reads everything the account HAS rather than only
 * what the old detail endpoint happened to return. A customer acquired a bag, a
 * set of addresses, price watches and notification preferences over the v2
 * work, and none of it was reachable from the admin: a support call about "the
 * thing in my basket" could not be answered from this screen.
 *
 * Every panel is honest about an empty state and none of them invents a total.
 * The bag in particular shows the price each line was QUOTED at when it was
 * added — the bag re-prices on every render because FX and the fee schedule
 * move, so this screen must not present a stored figure as a current one, and
 * it must not add the lines up itself (CLAUDE.md: pricing arithmetic lives only
 * in `lib/pricing`).
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getAuthenticatedUser();
  if (!viewer || !canAccessAdmin(viewer)) notFound();

  const { id } = await params;

  const detail = await getUserDetail(createAdminClient(), viewer, id).catch(() => null);
  if (!detail) notFound();

  const { user, recentOrders } = detail;

  const [prefs, bag, addresses, watches, notifications] = await Promise.all([
    getUserPreferences(id).catch(() => null),
    getOpenBagForUser(id).catch(() => null),
    listDeliveryAddresses(id).catch(() => []),
    listWatchesForUser(id).catch(() => []),
    listNotificationsForAdmin({ userId: id }, 8).catch(() => []),
  ]);

  const now = new Date();
  const name = userDisplayName(user.profile, user.email);
  const badge = roleBadge(user.profile.role);
  const channels = prefs ? contactChannelsLabel(prefs) : null;
  const activeWatches = watches.filter((watch) => watch.is_active).length;

  return (
    <AdminPage
      title={name}
      blurb={user.email ?? "This account has no email address on file."}
      action={
        <Link
          href="/admin/users"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          All users
        </Link>
      }
    >
      {/* ── Identity ──────────────────────────────────────────────────── */}
      <AdminCard index={0}>
        <div className="flex flex-wrap items-start gap-5">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-tm-tint font-display text-[18px] leading-none font-bold text-tm-ink"
          >
            {userInitials(user.profile, user.email)}
          </span>
          <dl className="grid min-w-0 flex-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Role">
              <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
            </Fact>
            <Fact label="Joined">
              <span className="tm-nums">{formatJoined(user.created_at) ?? "—"}</span>
            </Fact>
            <Fact label="Last signed in">
              <span className="tm-nums">{formatJoined(user.last_sign_in_at) ?? "Never"}</span>
            </Fact>
            <Fact label="Phone">
              {/*
                profiles.phone is what the customer typed and is unverified
                (051). The number a courier is actually given lives on the
                delivery address, so this is labelled as the account number
                rather than presented as a delivery contact.
              */}
              <span className="tm-nums">{prefs?.phone ?? "None saved"}</span>
            </Fact>
          </dl>
        </div>
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Access ──────────────────────────────────────────────────── */}
        <AdminCard
          index={1}
          title="Access"
          blurb="Role changes are written by the server with a service-role client and recorded in the audit log."
        >
          <div className="flex flex-col gap-5">
            <AdminRoleControl
              userId={user.id}
              userLabel={name}
              currentRole={user.profile.role}
              isSelf={viewer.id === user.id}
            />
            <div className="border-t border-tm-hairline pt-4">
              <AdminPasswordReset userId={user.id} email={user.email ?? null} />
            </div>
          </div>
        </AdminCard>

        {/* ── How they are reached ────────────────────────────────────── */}
        <AdminCard
          index={2}
          title="How they are reached"
          blurb="The customer sets these on their own account screen. They are not editable from here."
        >
          {prefs === null ? (
            <AdminEmpty
              title="Preferences could not be read"
              body="The profile row for this account did not come back. That is unusual, since every account gets one on sign-up, and is worth checking in the database."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {channels ? (
                <div className="flex flex-wrap items-center gap-2">
                  <AdminBadge tone={channels.tone}>{channels.label}</AdminBadge>
                </div>
              ) : null}
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact label="Transactional email">
                  {prefs.notify_email ? "On" : "Off"}
                </Fact>
                <Fact label="WhatsApp updates">
                  {prefs.whatsapp_opt_in ? "Opted in" : "Not opted in"}
                </Fact>
              </dl>
              {channels?.tone === "coral" ? (
                <p className="rounded-[14px] bg-tm-pill-bg px-4 py-3 text-[13px] leading-[1.5] font-medium text-tm-coral-strong">
                  Nothing the platform sends will reach this customer. An order confirmation,
                  a price drop or a finished paste will be written to the notification log and
                  go nowhere.
                </p>
              ) : null}
            </div>
          )}
        </AdminCard>
      </div>

      {/* ── Bag ───────────────────────────────────────────────────────── */}
      <AdminCard
        index={3}
        title="Open bag"
        blurb={
          bag
            ? "What is in the bag right now. Each line shows the landed price it was QUOTED at when it was added. The bag re-prices on every render, so these are not current totals."
            : undefined
        }
      >
        {!bag || bag.lines.length === 0 ? (
          <AdminEmpty
            title="Nothing in the bag"
            body="This customer has no open bag, or has one with no lines in it. A bag is created the first time they add a product and closes when they check out."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-tm-hairline">
            {bag.lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-[1.4] font-semibold text-tm-ink">
                    {line.product_name ?? line.product_url ?? "Waiting on the paste"}
                  </p>
                  {line.special_instructions ? (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-[1.4] font-medium text-tm-text-3">
                      “{line.special_instructions}”
                    </p>
                  ) : null}
                  {line.product_name == null ? (
                    <p className="mt-1 text-[12px] leading-[1.4] font-medium text-tm-amber">
                      This line has no priced product yet; the paste has not finished.
                    </p>
                  ) : null}
                </div>
                <div className="tm-nums flex shrink-0 items-center gap-4 text-[13px] leading-none font-semibold text-tm-text-2">
                  <span>×{line.quantity}</span>
                  <span className="text-tm-ink">
                    {line.quoted_total_ghs != null ? formatGhs(line.quoted_total_ghs) : "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Orders ──────────────────────────────────────────────────── */}
        <AdminCard
          index={4}
          title="Recent orders"
          blurb={`${formatCount(recentOrders?.length ?? 0)} most recent.`}
        >
          {!recentOrders || recentOrders.length === 0 ? (
            <AdminEmpty
              title="No orders yet"
              body="This account has never placed an order. A quote or a bag on its own does not create one. An order exists from the moment payment is started."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-tm-hairline">
              {recentOrders.map((order) => (
                <li key={order.id} className="py-3 first:pt-0">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="flex flex-wrap items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] leading-[1.4] font-semibold text-tm-ink">
                        {order.product_name}
                      </p>
                      <p className="tm-nums mt-1 text-[12px] leading-none font-medium text-tm-text-3">
                        {order.order_no} · {formatJoined(order.created_at) ?? ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <AdminBadge tone={orderStatusTone(order.status)}>
                        {orderStatusLabel(order.status)}
                      </AdminBadge>
                      {/*
                        The order's own stored total. `admin_total_ghs` wins when
                        an admin has repriced it, exactly as the order screen
                        does — this page reads the figure, it never derives one.
                      */}
                      <span className="tm-nums text-[13px] leading-none font-semibold text-tm-ink">
                        {formatGhs(order.admin_total_ghs ?? order.pricing?.total_ghs ?? 0)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        {/* ── Addresses ───────────────────────────────────────────────── */}
        <AdminCard
          index={5}
          title="Delivery addresses"
          blurb="Where this customer has asked for things to go. The default is used unless they pick another at checkout."
        >
          {addresses.length === 0 ? (
            <AdminEmpty
              title="No saved addresses"
              body="Nothing saved yet. An address is created the first time the customer fills one in at checkout."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-tm-hairline">
              {addresses.map((address) => (
                <li key={address.id} className="flex flex-col gap-1 py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] leading-none font-semibold text-tm-ink">
                      {formatAddressLabel(address)}
                    </span>
                    {address.is_default ? <AdminBadge tone="green">Default</AdminBadge> : null}
                  </div>
                  <p className="text-[12px] leading-[1.45] font-medium text-tm-text-2">
                    {address.recipient_name} · <span className="tm-nums">{address.phone}</span>
                  </p>
                  <p className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
                    {[address.line1, address.line2, address.area, address.city]
                      .filter(Boolean)
                      .join(", ")}
                    {address.digital_address ? (
                      <span className="tm-nums"> · {address.digital_address}</span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Watches ─────────────────────────────────────────────────── */}
        <AdminCard
          index={6}
          title="Price watches"
          blurb={`${formatCount(activeWatches)} being checked, ${formatCount(watches.length - activeWatches)} stopped.`}
          action={
            watches.length > 0 ? (
              <Link
                href="/admin/watches"
                className="text-[12px] leading-none font-semibold text-tm-text-2 underline underline-offset-2 hover:text-tm-ink"
              >
                All watches
              </Link>
            ) : null
          }
        >
          {watches.length === 0 ? (
            <AdminEmpty
              title="Not watching anything"
              body="This customer has never put a product on watch, so the nightly re-check job has nothing to do for them."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-tm-hairline">
              {watches.map((watch) => (
                <li key={watch.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-[1.4] font-semibold text-tm-ink">
                      {watch.product_name ?? watch.product_url}
                    </p>
                    <p className="mt-1 text-[12px] leading-none font-medium text-tm-text-3">
                      {watch.last_checked_at ? (
                        <span className="tm-nums">
                          Checked {relativeTime(watch.last_checked_at, now) ?? "—"}
                        </span>
                      ) : (
                        "Never checked"
                      )}
                      {watch.notified_at ? (
                        <span className="tm-nums">
                          {" · "}Alerted {relativeTime(watch.notified_at, now) ?? "—"}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {watch.is_active ? (
                      watch.consecutive_failures > 0 ? (
                        <AdminBadge tone="amber">
                          {watch.consecutive_failures} failed checks
                        </AdminBadge>
                      ) : (
                        <AdminBadge tone="green">Checking</AdminBadge>
                      )
                    ) : (
                      <AdminBadge tone="muted">
                        {watch.consecutive_failures > 0 ? "Retired" : "Stopped"}
                      </AdminBadge>
                    )}
                    {watch.last_price_usd != null ? (
                      <span className="tm-nums text-[13px] leading-none font-semibold text-tm-ink">
                        {formatUsd(watch.last_price_usd)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        {/* ── Notifications ───────────────────────────────────────────── */}
        <AdminCard
          index={7}
          title="What we told them"
          blurb="The last few messages addressed to this account."
          action={
            <Link
              href={`/admin/notifications?userId=${user.id}`}
              className="text-[12px] leading-none font-semibold text-tm-text-2 underline underline-offset-2 hover:text-tm-ink"
            >
              Full log
            </Link>
          }
        >
          {notifications.length === 0 ? (
            <AdminEmpty
              title="Nothing sent to this account"
              body="No message has been written for them. A row appears here before any send is attempted, so an empty list means nothing has triggered one."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-tm-hairline">
              {notifications.map((row) => {
                const statusBadge = notificationStatusBadge(row.status);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] leading-none font-semibold text-tm-ink">
                        {notificationEventLabel(row.event)}
                      </p>
                      <p className="tm-nums mt-1.5 text-[12px] leading-none font-medium text-tm-text-3">
                        {row.channel === "email" ? "Email" : "WhatsApp"} ·{" "}
                        {relativeTime(row.created_at, now) ?? "—"}
                      </p>
                    </div>
                    <AdminBadge tone={statusBadge.tone}>{statusBadge.label}</AdminBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

/** One label-and-value pair, at the rhythm every fact block on this page uses. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[12px] leading-none font-semibold text-tm-text-2">{label}</dt>
      <dd className="text-[13px] leading-none font-semibold text-tm-ink">{children}</dd>
    </div>
  );
}
