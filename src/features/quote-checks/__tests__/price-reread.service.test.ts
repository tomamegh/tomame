import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/layout/marketing/links", () => ({ whatsappHref: () => null }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn(async () => ({})) }));
vi.mock("@/db/queries/extraction-cache", () => ({ getExtractionById: vi.fn() }));
vi.mock("@/db/queries/quote-checks", () => ({
  correctSnapshotPrice: vi.fn(),
  getQuoteCheck: vi.fn(),
  insertQuoteCheck: vi.fn(),
  listQuoteCheckQueue: vi.fn(),
  listQuoteChecksForExtractions: vi.fn(async () => []),
  updateQuoteCheckFrom: vi.fn(),
}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/catalog/services/catalog-budget", () => ({
  budgetPeriodOf: () => "2026-11",
  readJobBudget: vi.fn(async () => ({ used: 0, cap: 30 })),
  spendJobBudget: vi.fn(),
}));
vi.mock("@/features/extraction/price-reread", () => ({ rereadPrice: vi.fn() }));
vi.mock("@/features/staff-alerts/notify", () => ({ notifyStaff: vi.fn() }));

import { getExtractionById } from "@/db/queries/extraction-cache";
import { getQuoteCheck, insertQuoteCheck, listQuoteChecksForExtractions, updateQuoteCheckFrom, type QuoteCheckRow } from "@/db/queries/quote-checks";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { readJobBudget } from "@/features/catalog/services/catalog-budget";
import { rereadPrice } from "@/features/extraction/price-reread";
import { notifyStaff } from "@/features/staff-alerts/notify";
import { emptyProduct } from "@/features/extraction/scrapers/types";
import type { ExtractionResult } from "@/features/extraction/types";
import { ensureQuoteChecks, quoteTrustFor, runPriceReread } from "../services/quote-checks.service";

const viewer = { userId: null, sessionId: "sess-1" };
const result = (level: "single_source" | "unconfirmed"): ExtractionResult =>
  ({
    platform: "amazon",
    product: { ...emptyProduct(), title: "LEGO Iron Man Mech", price: 13.49, currency: "USD" },
    price_source: "platform-html",
    price_confidence: { level, reasons: level === "unconfirmed" ? ["html_only"] : ["one_read"], source: "platform-html" },
  }) as unknown as ExtractionResult;

const row = (over: Partial<QuoteCheckRow> = {}): QuoteCheckRow =>
  ({
    id: "chk-1",
    kind: "price",
    origin: "system",
    status: "checking",
    extraction_cache_id: "ext-1",
    product_url: "https://www.amazon.com/dp/B0DJ1C3J2B",
    product_title: "LEGO",
    platform: "amazon",
    quoted_price: 13.49,
    quoted_currency: "USD",
    price_source: "platform-html",
    reasons: ["Read only from the page HTML"],
    reread_at: null,
    valid_until: null,
    confirmed_price: null,
    substitute_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  }) as QuoteCheckRow;

const snapshot = (level: "single_source" | "unconfirmed") => ({ id: "ext-1", productUrl: "https://www.amazon.com/dp/B0DJ1C3J2B", result: result(level) });
const patchOf = () => vi.mocked(updateQuoteCheckFrom).mock.calls[0]?.[2];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateQuoteCheckFrom).mockImplementation(async (id, _from, patch) => row({ id, ...patch }));
  vi.mocked(readJobBudget).mockResolvedValue({ used: 0, cap: 30 } as never);
});

describe("runPriceReread", () => {
  it("unconfirmed + an independent read that agrees → confirmed for 24 h", async () => {
    vi.mocked(getQuoteCheck).mockResolvedValue(row());
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("unconfirmed"));
    vi.mocked(rereadPrice).mockResolvedValue([{ source: "amazon-offers", price: 13.49, currency: "USD" }]);
    await runPriceReread("chk-1");
    expect(patchOf()).toMatchObject({ status: "confirmed", confirmed_price: 13.49, reread_source: "amazon-offers" });
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it("disagrees → staff, alerted", async () => {
    vi.mocked(getQuoteCheck).mockResolvedValue(row());
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("unconfirmed"));
    vi.mocked(rereadPrice).mockResolvedValue([{ source: "amazon-offers", price: 22.8, currency: "USD" }]);
    await runPriceReread("chk-1");
    expect(patchOf()).toMatchObject({ status: "pending", reread_price: 22.8 });
    expect(notifyStaff).toHaveBeenCalledWith({ kind: "quote_check", checkId: "chk-1" });
  });

  it("unconfirmed + nothing could re-read it → staff (never lapsed), marked as re-read", async () => {
    vi.mocked(getQuoteCheck).mockResolvedValue(row());
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("unconfirmed"));
    vi.mocked(rereadPrice).mockResolvedValue([]);
    await runPriceReread("chk-1");
    expect(patchOf()).toMatchObject({ status: "pending" });
    expect(patchOf()?.reread_at).toEqual(expect.any(String));
    expect(notifyStaff).toHaveBeenCalled();
  });

  it("unconfirmed + no budget left → staff", async () => {
    vi.mocked(getQuoteCheck).mockResolvedValue(row());
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("unconfirmed"));
    vi.mocked(readJobBudget).mockResolvedValue({ used: 30, cap: 30 } as never);
    await runPriceReread("chk-1");
    expect(rereadPrice).not.toHaveBeenCalled();
    expect(patchOf()).toMatchObject({ status: "pending" });
  });

  it("single-source + nothing could re-read it → lapsed, as before", async () => {
    vi.mocked(getQuoteCheck).mockResolvedValue(row());
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("single_source"));
    vi.mocked(rereadPrice).mockResolvedValue([]);
    await runPriceReread("chk-1");
    expect(patchOf()).toMatchObject({ status: "lapsed" });
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it("a row no longer checking (staff decided meanwhile) is left alone", async () => {
    vi.mocked(getQuoteCheck).mockResolvedValue(row({ status: "confirmed" }));
    await runPriceReread("chk-1");
    expect(updateQuoteCheckFrom).not.toHaveBeenCalled();
  });
});

describe("opening checks", () => {
  it("an unconfirmed price opens an automatic re-read, not a staff check", async () => {
    vi.mocked(insertQuoteCheck).mockResolvedValue(row());
    vi.mocked(getQuoteCheck).mockResolvedValue(null);
    await ensureQuoteChecks(viewer, "ext-1", "https://www.amazon.com/dp/B0DJ1C3J2B", result("unconfirmed"));
    expect(insertQuoteCheck).toHaveBeenCalledWith(expect.objectContaining({ kind: "price", status: "checking" }));
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it("viewing a quote re-reads a staff check that never had one, once (guarded pending → checking)", async () => {
    const legacy = row({ status: "pending", created_at: "2026-11-20T14:44:00Z", updated_at: "2026-11-20T14:44:00Z" });
    vi.mocked(listQuoteChecksForExtractions).mockResolvedValue([legacy]);
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("unconfirmed"));
    vi.mocked(getQuoteCheck).mockResolvedValue(null);
    await quoteTrustFor("ext-1", result("unconfirmed"), viewer);
    expect(updateQuoteCheckFrom).toHaveBeenCalledWith("chk-1", "pending", { status: "checking" });
    expect(vi.mocked(logAuditEvent).mock.calls.some(([e]) => e.action === "quote_check_reread_started")).toBe(true);

    // The second viewer's guarded move matches nothing: no second run.
    vi.mocked(updateQuoteCheckFrom).mockResolvedValueOnce(null);
    vi.mocked(logAuditEvent).mockClear();
    await quoteTrustFor("ext-1", result("unconfirmed"), viewer);
    expect(vi.mocked(logAuditEvent).mock.calls.some(([e]) => e.action === "quote_check_reread_started")).toBe(false);
  });

  it("a staff check that was already re-read is not re-read again", async () => {
    vi.mocked(listQuoteChecksForExtractions).mockResolvedValue([row({ status: "pending", reread_at: "2026-11-20T14:45:00Z" })]);
    await quoteTrustFor("ext-1", result("unconfirmed"), viewer);
    expect(updateQuoteCheckFrom).not.toHaveBeenCalled();
    expect(insertQuoteCheck).not.toHaveBeenCalled();
  });

  it("a lost re-read of an unconfirmed price is handed to staff", async () => {
    vi.mocked(listQuoteChecksForExtractions).mockResolvedValue([row({ status: "checking", created_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-20T10:00:00Z" })]);
    vi.mocked(getExtractionById).mockResolvedValue(snapshot("unconfirmed"));
    await quoteTrustFor("ext-1", result("unconfirmed"), viewer);
    expect(updateQuoteCheckFrom).toHaveBeenCalledWith("chk-1", "checking", expect.objectContaining({ status: "pending" }));
    expect(notifyStaff).toHaveBeenCalled();
  });
});
