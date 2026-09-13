import type { AdminTone } from "@/components/layout/admin";

/**
 * Display helpers for the admin delivery log.
 *
 * `notifications` is the record of what the platform told a customer, and the
 * admin question it has to answer is not "what happened" but "who was never
 * told". That makes `failed` the load-bearing status here, and it is the one
 * this file is careful about: a failed row is a customer sitting with no email
 * about an order they have paid for.
 *
 * Pure functions, `now` passed in rather than read, so the server's render and
 * the client's hydration cannot disagree about what "2 hours ago" means.
 * British English throughout.
 *
 * The two unions are spelled out here rather than imported from
 * `db/queries/admin-notifications`: the header bell is a client component and
 * imports this file, and that query module is `server-only`. A type-only import
 * is erased today and becomes a build failure the first time somebody tidies
 * the `type` keyword off it. They mirror the CHECK constraints in migration 019.
 */

/** `notifications.status` — migration 019's CHECK constraint. */
export type AdminNotificationStatus = "pending" | "sent" | "failed";
/** `notifications.channel` — migration 019's CHECK constraint. */
export type AdminNotificationChannel = "email" | "whatsapp";

/**
 * The event vocabulary, humanised.
 *
 * Kept deliberately in step with `notificationTitle` in
 * `components/layout/app/notification-bell.tsx`, which is the customer's
 * spelling of the same slugs — an admin reading a row and the customer reading
 * their bell should be looking at the same words. The admin gets the plain
 * event rather than the customer's second person ("A price you're watching
 * dropped" is the customer's sentence; "Price drop" is the admin's).
 *
 * Unknown slugs are humanised rather than hidden: a new event type shipping
 * without a label here must still show up in the log.
 */
const EVENT_LABELS: Record<string, string> = {
  order_placed: "Order placed",
  order_placed_admin: "Order placed (admin copy)",
  price_drop: "Price drop",
  paste_priced: "Paste priced",
  paste_unreadable: "Paste unreadable",
};

export function notificationEventLabel(event: string): string {
  const known = EVENT_LABELS[event];
  if (known) return known;
  const words = event.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The status chip.
 *
 * `pending` is amber because it genuinely is somebody's problem: the row was
 * written before the transport was attempted (`insertNotification`), so a row
 * still pending long after it was created means the send never completed.
 * `failed` is coral — it is not waiting on anyone, it is already wrong.
 */
export function notificationStatusBadge(
  status: AdminNotificationStatus,
): { label: string; tone: AdminTone } {
  switch (status) {
    case "sent":
      return { label: "Sent", tone: "green" };
    case "pending":
      return { label: "Pending", tone: "amber" };
    case "failed":
      return { label: "Failed", tone: "coral" };
  }
}

export function notificationChannelLabel(channel: AdminNotificationChannel): string {
  return channel === "email" ? "Email" : "WhatsApp";
}

/**
 * A recipient's name, or an honest stand-in.
 *
 * `profiles` has no email column, so a name is all a list row can have without
 * an auth call per user. A profile with neither name reads as its short id
 * rather than "Unknown" — the id is a fact an admin can act on, and "Unknown"
 * is not.
 */
export function recipientLabel(
  recipient: { first_name: string | null; last_name: string | null } | null,
  userId: string,
): string {
  const name = [recipient?.first_name, recipient?.last_name].filter(Boolean).join(" ").trim();
  if (name.length > 0) return name;
  return `Account ${userId.slice(0, 8)}`;
}

/**
 * "3 min ago" / "just now" / "5 d ago", measured against a passed-in instant.
 *
 * Returns null on an unparseable timestamp instead of "Invalid Date", so a bad
 * row shows nothing rather than shouting at the admin about a formatting
 * problem they cannot fix.
 */
export function relativeTime(iso: string, now: Date): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 0) return "just now";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;

  const months = Math.floor(days / 30);
  return `${months} mo ago`;
}

/**
 * How long a pending notification has been pending, when that is long enough to
 * be suspicious.
 *
 * The row is inserted as `pending` immediately before the transport call and
 * closed out the moment it returns, so pending is a state that should last
 * milliseconds. Anything still pending an hour later did not merely take a
 * while — the process that owed it an outcome never came back, and the
 * customer has no idea. Under the hour there is nothing useful to say, so this
 * answers null rather than inventing a warning.
 */
export function stuckPendingLabel(createdAt: string, now: Date): string | null {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return null;

  const hours = Math.floor((now.getTime() - then) / 3_600_000);
  if (hours < 1) return null;
  if (hours < 24) return `Pending for ${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.floor(hours / 24);
  return `Pending for ${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * Group a sample of rows into per-event delivery counts, worst first.
 *
 * Sorted by failures descending, then by volume: the point of the breakdown is
 * to find the event type that is failing, and an event with three failures out
 * of five matters more than one with none out of four hundred.
 */
export interface EventBreakdownRow {
  event: string;
  label: string;
  total: number;
  sent: number;
  pending: number;
  failed: number;
}

export function summariseEvents(
  rows: readonly { event: string; status: AdminNotificationStatus }[],
): EventBreakdownRow[] {
  const byEvent = new Map<string, EventBreakdownRow>();

  for (const row of rows) {
    let entry = byEvent.get(row.event);
    if (!entry) {
      entry = {
        event: row.event,
        label: notificationEventLabel(row.event),
        total: 0,
        sent: 0,
        pending: 0,
        failed: 0,
      };
      byEvent.set(row.event, entry);
    }
    entry.total += 1;
    entry[row.status] += 1;
  }

  return [...byEvent.values()].sort(
    (a, b) => b.failed - a.failed || b.total - a.total || a.label.localeCompare(b.label),
  );
}
