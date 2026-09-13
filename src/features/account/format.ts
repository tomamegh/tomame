/**
 * Pure display helpers for the account screen.
 *
 * Framework-free and side-effect free so they can be unit tested directly, and
 * so a server component and a client island format the same row identically.
 */

/**
 * Pesewas to cedis. Payment amounts are integers in pesewas throughout
 * (CLAUDE.md); this is the ONLY place the account screen divides, so there is
 * one conversion to be wrong rather than one per panel.
 */
export function pesewasToGhs(pesewas: number): number {
  if (!Number.isFinite(pesewas)) return 0;
  return pesewas / 100;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * "13 Sep 2026". Returns the raw string for anything unparseable rather than
 * rendering "Invalid Date" — a bad timestamp is a display problem, not a reason
 * to show the customer a broken row.
 */
export function formatPaymentDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

/**
 * `payments.channel` is whatever Paystack reported the transaction went out on
 * — "mobile_money", "card", "bank_transfer". Rendered as words.
 *
 * Deliberately NOT a lookup table of known channels with a fallback of
 * "Unknown": Paystack can add a channel tomorrow, and a customer who paid by it
 * should see its name, not a shrug. Underscores become spaces, first letter
 * capitalised, and the value is otherwise shown as it was recorded.
 */
export function formatPaymentChannel(channel: string): string {
  const words = channel.trim().replace(/_/g, " ");
  if (words === "") return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "13 Sep 2026, 14:32" for a notification row — notifications arrive many to a
 * day, so the date alone cannot order them for the reader.
 */
const stampFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatNotificationStamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : stampFormatter.format(date);
}

/**
 * `notifications.event` is a snake_case machine name ("order_placed",
 * "payment_succeeded_admin"). Turned into a sentence for the list.
 *
 * The `_admin` suffix is dropped: those rows are the copy sent to staff about a
 * customer's order, and the customer seeing "Order placed admin" would be
 * reading our internal plumbing. Same open-set reasoning as the channel above —
 * a new event kind renders as its own words rather than as "Notification".
 */
export function formatNotificationEvent(event: string): string {
  const words = event.trim().replace(/_admin$/, "").replace(/_/g, " ");
  if (words === "") return "Notification";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "3 unread" / "1 unread" / null at zero, so the header drops the badge rather
 * than announcing "0 unread".
 */
export function formatUnreadCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return `${Math.floor(count)} unread`;
}
