import { afterEach, describe, expect, it, vi } from "vitest";

import { isIgnorableClientError } from "@/components/observability/client-error-listener";
import { apiPathOf, createReportThrottle, reportKey } from "@/lib/observability/report-client-error";

describe("createReportThrottle", () => {
  it("sends one report per issue per window", () => {
    const t = createReportThrottle({ windowMs: 60_000, maxPerPage: 20 });
    expect(t.allow("a", 0)).toBe(true);
    expect(t.allow("a", 30_000)).toBe(false);
    expect(t.allow("b", 30_000)).toBe(true);
    expect(t.allow("a", 61_000)).toBe(true);
  });

  it("stops at the per-page cap, so a render loop cannot flood the endpoint", () => {
    const t = createReportThrottle({ windowMs: 60_000, maxPerPage: 3 });
    expect([1, 2, 3, 4, 5].map((i) => t.allow(`k${i}`, i))).toEqual([true, true, true, false, false]);
  });
});

describe("reportKey", () => {
  it("is the same for the same failure in the same place", () => {
    const a = reportKey({ kind: "api_4xx", api: "/api/app/me", status: 400, message: "Invalid input" });
    expect(a).toBe(reportKey({ kind: "api_4xx", api: "/api/app/me", status: 400, message: "Invalid input" }));
    expect(a).not.toBe(reportKey({ kind: "api_4xx", api: "/api/addresses", status: 400, message: "Invalid input" }));
  });
});

describe("apiPathOf", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps same-origin /api paths and drops the query string", () => {
    vi.stubGlobal("window", { location: { origin: "https://tomame.ca", pathname: "/app" } });
    expect(apiPathOf("/api/app/me?token=secret")).toBe("/api/app/me");
    expect(apiPathOf("https://tomame.ca/api/cart")).toBe("/api/cart");
  });

  it("ignores other origins and non-API paths", () => {
    vi.stubGlobal("window", { location: { origin: "https://tomame.ca", pathname: "/app" } });
    expect(apiPathOf("https://api.paystack.co/transaction")).toBeNull();
    expect(apiPathOf("/app/account")).toBeNull();
  });
});

describe("isIgnorableClientError", () => {
  it("drops noise nobody can act on", () => {
    expect(isIgnorableClientError("Script error.")).toBe(true);
    expect(isIgnorableClientError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isIgnorableClientError("x is undefined", "chrome-extension://abc/inject.js")).toBe(true);
    expect(isIgnorableClientError("Cannot read properties of undefined (reading 'price')")).toBe(false);
  });
});
