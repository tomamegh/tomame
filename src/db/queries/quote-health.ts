import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaidOrderInput, QuoteHealthInput, QuoteRowInput } from "@/features/ops/quote-health";

/**
 * The rows behind quote health (A6): extraction_cache rows touched in the
 * window, stuck pastes, open checks, recorded store prices and undelivered
 * notifications. Reads only; the counting is `features/ops/quote-health.ts`.
 */

const CAP = 5000;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const minutesSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 60_000 : null);

export async function readQuoteHealthInput(input: {
  now: Date;
  since: string;
  stuckBefore: string;
  driftSince: string;
  notificationsBefore: string;
}): Promise<QuoteHealthInput> {
  const db = createAdminClient();
  const [quotes, stuck, checks, paid, waStuck, bell] = await Promise.all([
    db
      .from("extraction_cache")
      .select("source, platform:result->>platform, price_source:result->>price_source, price:result->product->>price, confidence:result->price_confidence->>level, leaked:result->quality->leaked, rejected:result->quality->price_rejected")
      .gte("updated_at", input.since)
      .limit(CAP),
    db.from("extraction_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "running"]).lt("updated_at", input.stuckBefore),
    db.from("quote_checks").select("kind, created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(500),
    db
      .from("orders")
      .select("quantity, store_paid_price, store_paid_currency, platform:extraction_metadata->>platform, price_source:extraction_metadata->>price_source, source:extraction_metadata->>source, quoted:extraction_metadata->product->>price, quoted_currency:extraction_metadata->product->>currency")
      .gte("store_paid_at", input.driftSince)
      .limit(CAP),
    db.from("notifications").select("created_at").eq("channel", "whatsapp").eq("status", "pending").lt("created_at", input.notificationsBefore).order("created_at", { ascending: true }).limit(200),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "email").eq("status", "pending"),
  ]);
  for (const [label, r] of [["quotes", quotes], ["stuck pastes", stuck], ["checks", checks], ["paid orders", paid], ["notifications", waStuck], ["bell rows", bell]] as const) {
    if (r.error) throw new Error(`quote health: ${label} failed: ${r.error.message}`);
  }

  const quoteRows: QuoteRowInput[] = ((quotes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    platform: (r.platform as string | null) ?? null,
    price_source: (r.price_source as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    price: num(r.price),
    confidence: (r.confidence as string | null) ?? null,
    leaked: Array.isArray(r.leaked) ? r.leaked.length : 0,
    price_rejected: r.rejected != null,
  }));

  const open = (checks.data ?? []) as Array<{ kind: string; created_at: string }>;
  const paidRows: PaidOrderInput[] = ((paid.data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      platform: (r.platform as string | null) ?? null,
      tier: ((r.price_source as string | null) ?? (r.source as string | null)) ?? null,
      quoted_price: num(r.quoted),
      quoted_currency: (r.quoted_currency as string | null) ?? null,
      paid_price: num(r.store_paid_price) ?? 0,
      paid_currency: String(r.store_paid_currency ?? "USD"),
    }))
    .filter((r) => r.paid_price > 0);

  const waRows = (waStuck.data ?? []) as Array<{ created_at: string }>;
  return {
    quotes: quoteRows,
    stuckPastes: stuck.count ?? 0,
    checksWaiting: {
      price: open.filter((c) => c.kind === "price").length,
      stock: open.filter((c) => c.kind === "stock").length,
      oldestMinutes: minutesSince(open[0]?.created_at, input.now),
    },
    paid: paidRows,
    notificationsStuck: { count: waRows.length, oldestMinutes: minutesSince(waRows[0]?.created_at, input.now) },
    bellOnlyPending: bell.count ?? 0,
  };
}
