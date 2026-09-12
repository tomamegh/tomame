import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/db/queries/catalog", () => ({
  claimNextDueQuery: vi.fn(),
  markQueryResult: vi.fn(),
  upsertCatalogProducts: vi.fn(),
  searchCatalogProducts: vi.fn(),
  getOrCreateBudget: vi.fn(),
  incrementBudget: vi.fn(),
}));

vi.mock("../services/scraperapi-search", () => ({
  fetchCatalogSearch: vi.fn(),
  isScraperApiConfigured: vi.fn(() => true),
}));

vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

import {
  claimNextDueQuery,
  getOrCreateBudget,
  incrementBudget,
  markQueryResult,
  upsertCatalogProducts,
  type CatalogQueryRow,
} from "@/db/queries/catalog";
import { fetchCatalogSearch, isScraperApiConfigured } from "../services/scraperapi-search";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { CATALOG_JOB } from "@/config/catalog";
import { budgetPeriodOf, runCatalogScrapeJob } from "../services/catalog-scrape.service";

const NOW = new Date("2026-09-12T10:00:00Z");

function queryRow(overrides: Partial<CatalogQueryRow> = {}): CatalogQueryRow {
  return {
    id: "q-1",
    store: "amazon",
    category: "Headphones",
    query: "wireless earbuds",
    priority: 5,
    is_active: true,
    source: "seed",
    last_run_at: null,
    last_result_count: null,
    consecutive_failures: 0,
    next_run_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

const budget = (used: number, cap = 500) => ({ job: CATALOG_JOB.jobName, period: "2026-09", used, cap, updated_at: NOW.toISOString() });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isScraperApiConfigured).mockReturnValue(true);
  vi.mocked(markQueryResult).mockResolvedValue(undefined);
});

describe("budgetPeriodOf", () => {
  it("is YYYY-MM in UTC", () => {
    expect(budgetPeriodOf(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
    expect(budgetPeriodOf(NOW)).toBe("2026-09");
  });
});

describe("runCatalogScrapeJob", () => {
  it("skips with { skipped: 'budget' } when the month's cap is spent — no claim, no vendor call", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(500));

    const summary = await runCatalogScrapeJob(NOW);

    expect(summary.skipped).toBe("budget");
    expect(summary.budget_used).toBe(500);
    expect(summary.budget_cap).toBe(500);
    expect(claimNextDueQuery).not.toHaveBeenCalled();
    expect(fetchCatalogSearch).not.toHaveBeenCalled();
    expect(incrementBudget).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: "system", entityType: "job", action: "catalog_scrape_run" }),
    );
  });

  it("reads the budget for the run's period with the default cap", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(0));
    vi.mocked(claimNextDueQuery).mockResolvedValue(null);

    const summary = await runCatalogScrapeJob(NOW);

    expect(getOrCreateBudget).toHaveBeenCalledWith(CATALOG_JOB.jobName, "2026-09", CATALOG_JOB.defaultMonthlyCap);
    expect(summary.skipped).toBe("no_due_query");
    expect(incrementBudget).not.toHaveBeenCalled();
  });

  it("does not spend a credit when the vendor is unconfigured", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(0));
    vi.mocked(isScraperApiConfigured).mockReturnValue(false);

    const summary = await runCatalogScrapeJob(NOW);

    expect(summary.skipped).toBe("vendor_unconfigured");
    expect(claimNextDueQuery).not.toHaveBeenCalled();
  });

  it("happy path: claims one query, fetches once, upserts, stamps the result, increments the budget, audits", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(3));
    vi.mocked(claimNextDueQuery).mockResolvedValue(queryRow());
    vi.mocked(fetchCatalogSearch).mockResolvedValue({
      rawCount: 2,
      items: [
        { store: "amazon", external_id: "B000000001", product_url: "u1", url_hash: "h1", title: "A", image_url: null, price_usd: 1, currency: "USD", rating: null, review_count: null, category: "Headphones", query_id: "q-1", raw: null },
        { store: "amazon", external_id: "B000000002", product_url: "u2", url_hash: "h2", title: "B", image_url: null, price_usd: 2, currency: "USD", rating: null, review_count: null, category: "Headphones", query_id: "q-1", raw: null },
      ],
    });
    vi.mocked(upsertCatalogProducts).mockResolvedValue(2);
    vi.mocked(incrementBudget).mockResolvedValue(budget(4));

    const summary = await runCatalogScrapeJob(NOW);

    expect(claimNextDueQuery).toHaveBeenCalledWith(NOW.toISOString(), CATALOG_JOB.requeryAfterHours);
    expect(fetchCatalogSearch).toHaveBeenCalledTimes(1);
    expect(fetchCatalogSearch).toHaveBeenCalledWith("amazon", "wireless earbuds", { queryId: "q-1", category: "Headphones" });
    expect(incrementBudget).toHaveBeenCalledWith(CATALOG_JOB.jobName, "2026-09", 1, CATALOG_JOB.defaultMonthlyCap);
    expect(markQueryResult).toHaveBeenCalledWith("q-1", { last_result_count: 2, consecutive_failures: 0, is_active: true });
    expect(summary).toMatchObject({ query_id: "q-1", store: "amazon", query: "wireless earbuds", fetched: 2, upserted: 2, budget_used: 4, budget_cap: 500 });
    expect(summary.skipped).toBeUndefined();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "catalog_scrape_run", entityId: "q-1", metadata: expect.objectContaining({ fetched: 2 }) }));
  });

  it("increments the budget on a vendor failure (a failed call still costs a credit) and records the failure", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(10));
    vi.mocked(claimNextDueQuery).mockResolvedValue(queryRow({ consecutive_failures: 1 }));
    vi.mocked(fetchCatalogSearch).mockRejectedValue(new Error("ScraperAPI amazon search failed: HTTP 500"));
    vi.mocked(incrementBudget).mockResolvedValue(budget(11));

    const summary = await runCatalogScrapeJob(NOW);

    expect(incrementBudget).toHaveBeenCalledTimes(1);
    expect(summary.budget_used).toBe(11);
    expect(summary.error).toMatch(/HTTP 500/);
    expect(summary.deactivated).toBe(false);
    expect(upsertCatalogProducts).not.toHaveBeenCalled();
    expect(markQueryResult).toHaveBeenCalledWith("q-1", { last_result_count: null, consecutive_failures: 2, is_active: true });
  });

  it("deactivates the query on the 5th consecutive failure", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(10));
    vi.mocked(claimNextDueQuery).mockResolvedValue(queryRow({ consecutive_failures: CATALOG_JOB.maxConsecutiveFailures - 1 }));
    vi.mocked(fetchCatalogSearch).mockRejectedValue(new Error("timeout"));
    vi.mocked(incrementBudget).mockResolvedValue(budget(11));

    const summary = await runCatalogScrapeJob(NOW);

    expect(summary.deactivated).toBe(true);
    expect(markQueryResult).toHaveBeenCalledWith("q-1", {
      last_result_count: null,
      consecutive_failures: CATALOG_JOB.maxConsecutiveFailures,
      is_active: false,
    });
  });

  it("a missing table fails the run loudly instead of reporting a zero", async () => {
    vi.mocked(getOrCreateBudget).mockRejectedValue(
      new Error('Failed to load job budget: relation "public.job_budgets" does not exist'),
    );
    await expect(runCatalogScrapeJob(NOW)).rejects.toThrow(/job_budgets/);
  });
});
