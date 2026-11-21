import { formatGhs } from "@/features/marketing/format";
import type { FinderChatSummary } from "./types";

/* Pure, directive-free: Home's server card and the chat screen's client list both read these. */

/** "3 min ago", "yesterday", "12 Nov". Read against the viewer's clock. */
export function chatWhen(iso: string, now: number = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  if (ms < 2 * 86_400_000) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The second line of a chat in the history: what its searches found. */
export function chatItemsLine(items: FinderChatSummary["items"]): string | null {
  if (items.length === 0) return null;
  return items
    .map((i) => {
      if (i.status === "pending" || i.status === "running") return `${i.product} · searching`;
      return i.totalGhs != null ? `${i.product} · ${formatGhs(i.totalGhs)}` : `${i.product} · not found`;
    })
    .join("  ·  ");
}

