/** Display helpers for the iPhone screens. Pure; no money arithmetic beyond rounding for display. */

const whole = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 4742.3 → "GH₵4,742" — the big figures on cards. */
export const ghs0 = (n: number): string => `GH₵${whole.format(Math.round(n))}`;
/** 4742.3 → "GH₵4,742.30" — totals the customer pays. */
export const ghs2 = (n: number): string => `GH₵${cents.format(n)}`;
export const usd2 = (n: number): string => `$${cents.format(n)}`;

/** "Morning" → "Good morning". */
export const greetingFor = (timeOfDay: string): string => `Good ${timeOfDay.toLowerCase()}`;

/** A short "2 h ago" / "Yesterday" / "Mon 3 Nov" for a past timestamp. */
export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });
}

/** "Sat 28 Nov" for an ISO date. */
export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });

/** The first http(s) URL in a piece of text, or null. */
export function firstUrl(text: string | undefined | null): string | null {
  const m = text?.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

/** "amazon.com/dp/B0CHW…" — a link short enough for one line. */
export function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

const STORE_NAMES: Record<string, string> = { amazon: "Amazon", ebay: "eBay", walmart: "Walmart", etsy: "Etsy", nike: "Nike", shein: "SHEIN" };
/** "ebay" → "eBay"; a name that is already a name passes through. */
export const storeLabel = (store: string): string => STORE_NAMES[store.toLowerCase()] ?? store;

/** A drop/rise percentage with a real minus sign: -13.2 → "−13%". */
export const pctLabel = (pct: number): string => `${pct < 0 ? "−" : "+"}${Math.abs(Math.round(pct))}%`;
