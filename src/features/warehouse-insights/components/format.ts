/**
 * Time, in words, for the activity timeline (082). Pure and `now`-taking, like
 * `dashboard-format.ts`, so the server's "3 min ago" is a tested function and
 * never a clock read mid-render. UTC throughout — Ghana's clock, all year.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** "Just now", "12 min ago", "3 h ago", "2 days ago", then the date. */
export function relativeTime(iso: string, now: Date): string {
  const diff = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / (24 * HOUR));
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return dayFormatter.format(new Date(iso)).replace("Sept", "Sep");
}

/** "14:02" — the clock time printed next to each row. */
export function clockTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "Wed, 30 Sep 2026, 14:02:11 UTC" — the tooltip, for when the exact second matters. */
export function absoluteTime(iso: string): string {
  return `${fullFormatter.format(new Date(iso)).replace("Sept", "Sep")} UTC`;
}

/** The day header a run of rows sits under: "Today", "Yesterday", "Monday 28 Sep". */
export function dayHeading(iso: string, now: Date): string {
  const day = new Date(iso).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * HOUR).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return dayFormatter.format(new Date(iso)).replace(",", "").replace("Sept", "Sep");
}

/** Rows grouped under their UTC day, order kept. */
export function groupByDay<T extends { created_at: string }>(rows: readonly T[]): Array<{ day: string; rows: T[] }> {
  const groups: Array<{ day: string; rows: T[] }> = [];
  for (const row of rows) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}
