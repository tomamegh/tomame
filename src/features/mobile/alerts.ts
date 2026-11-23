/**
 * What the iPhone app tells the customer when it is closed. Pure, so it is tested without a
 * database. A free Apple account cannot receive push, so there are two kinds:
 *
 * - **Reminders**: things known ahead of time (a box closing, a rate lock ending, a delivery
 *   day). The app schedules them on the phone, like Jimmy's.
 * - **Alerts**: things the server learns (a price drop, a stage change). iOS's background
 *   refresh wakes the app now and then to fetch the new ones and post them.
 */
import type { BagView } from "@/features/bag/types";
import type { HomeOrder } from "@/features/app-home/types";
import type { Notification } from "@/features/notifications/types";
import { describeNotification } from "@/features/notifications/describe";
import { mobilePathFor } from "@/lib/native/mobile-routes";

export interface AppReminder {
  /** Stable across reads, so rescheduling replaces rather than duplicates. */
  key: string;
  at: string;
  title: string;
  body: string;
  href: string;
}

export interface AppAlert {
  id: string;
  at: string;
  title: string;
  body: string;
  href: string;
}

const HOUR = 3_600_000;
export const BOX_REMINDER_LEAD_MS = 3 * HOUR;
export const LOCK_REMINDER_LEAD_MS = 2 * HOUR;
/** Delivery-day reminders go out at 9:00 in Accra (UTC+0, no daylight saving). */
export const DELIVERY_REMINDER_HOUR_UTC = 9;
export const MAX_REMINDERS = 20;
export const MAX_ALERTS = 5;
/** Never schedule a reminder that would fire within this window: it would land as noise. */
const MIN_LEAD_MS = 5 * 60_000;

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).replace(":00", "");
const items = (n: number) => `${n} ${n === 1 ? "item is" : "items are"}`;

export function buildAppReminders({ bag, orders, now = new Date() }: { bag: BagView | null; orders: HomeOrder[]; now?: Date }): AppReminder[] {
  const out: AppReminder[] = [];
  const later = (at: number) => at - now.getTime() > MIN_LEAD_MS;

  if (bag && bag.lines.length > 0) {
    for (const box of bag.boxes) {
      if (!box.cutoff_at) continue;
      const at = new Date(box.cutoff_at).getTime() - BOX_REMINDER_LEAD_MS;
      if (!later(at)) continue;
      out.push({
        key: `box:${box.id}:${box.cutoff_at}`,
        at: new Date(at).toISOString(),
        title: `Your box to Accra closes at ${timeLabel(box.cutoff_at)}`,
        body: `${items(box.item_count)} sharing freight. Pay before it flies to keep them together.`,
        href: "/m/bag",
      });
    }
    if (bag.rate_locked_until) {
      const at = new Date(bag.rate_locked_until).getTime() - LOCK_REMINDER_LEAD_MS;
      if (later(at)) {
        out.push({
          key: `lock:${bag.rate_locked_until}`,
          at: new Date(at).toISOString(),
          title: "Your locked rate ends in 2 hours",
          body: "Pay for your bag to keep today's price.",
          href: "/m/bag",
        });
      }
    }
  }

  for (const o of orders) {
    if (o.track.isComplete || o.track.isCancelled || !o.eta?.from) continue;
    const day = new Date(o.eta.from);
    const at = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), DELIVERY_REMINDER_HOUR_UTC);
    if (!later(at)) continue;
    out.push({
      key: `eta:${o.id}:${o.eta.from}`,
      at: new Date(at).toISOString(),
      title: o.eta.source === "confirmed" ? "Your parcel is due today" : "Your parcel could arrive today",
      body: `${o.orderNo} · ${o.productName}`,
      href: `/m/orders/${o.id}`,
    });
  }

  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, MAX_REMINDERS);
}

const DEDUPE_WINDOW_MS = 10 * 60_000;

/** Events that are not the customer's news (the admin copy of a new order). */
const NOT_FOR_THE_PHONE = new Set(["order_placed_admin"]);

/**
 * The customer's notifications newer than `since`, as phone alerts: newest first, one per
 * event even when it went out on both email and WhatsApp, and each pointing at an app screen.
 */
export function buildAppAlerts(notifications: Notification[], since: Date): AppAlert[] {
  const seen = new Set<string>();
  const out: AppAlert[] = [];
  const fresh = notifications
    .filter((n) => !NOT_FOR_THE_PHONE.has(n.event) && new Date(n.created_at).getTime() > since.getTime())
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const n of fresh) {
    const copy = describeNotification(n.event, n.payload);
    // The same news sent by email and WhatsApp is two rows a moment apart about the same thing.
    const p = n.payload ?? {};
    const subject = String(p.order_id ?? p.order_no ?? p.order_group_id ?? p.watch_id ?? p.product_url ?? `${copy.title}|${copy.detail ?? ""}`);
    const dedupe = `${n.event}|${subject}|${Math.floor(new Date(n.created_at).getTime() / DEDUPE_WINDOW_MS)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ id: n.id, at: n.created_at, title: copy.title, body: copy.detail ?? "", href: appHref(copy.href) });
    if (out.length >= MAX_ALERTS) break;
  }
  return out;
}

/** A website link from a notification, as the app screen it should open. */
export function appHref(href: string | null): string {
  if (!href) return "/m";
  if (href === "/m" || href.startsWith("/m/")) return href;
  const url = new URL(href, "https://app.invalid");
  return mobilePathFor(url.pathname, url.searchParams) ?? "/m";
}
