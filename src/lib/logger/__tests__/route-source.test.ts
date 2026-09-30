import { describe, expect, it } from "vitest";

import { apiCategory, categorise } from "@/lib/logger/error-category";
import { fingerprintOf, scrubMessage } from "@/lib/logger/error-sink";
import { normaliseRoutePath, routeFromStack } from "@/lib/logger/route-source";

describe("routeFromStack", () => {
  it("reads the route folder from a dev frame", () => {
    const stack = "Error: boom\n    at updateProfile (/Users/k/tomame/src/features/account/services/x.ts:10:5)\n    at async PATCH (/Users/k/tomame/src/app/api/app/me/route.ts:40:18)";
    expect(routeFromStack(stack)).toBe("/api/app/me");
  });

  it("reads it from a production bundle frame, dynamic segments included", () => {
    const stack = "Error: boom\n    at async POST (/var/task/.next/server/app/api/orders/[id]/feedback/route.js:1:2345)";
    expect(routeFromStack(stack)).toBe("/api/orders/[id]/feedback");
  });

  it("is null when no frame is a route", () => {
    expect(routeFromStack("Error: x\n    at foo (/var/task/.next/server/chunks/123.js:1:1)")).toBeNull();
    expect(routeFromStack(undefined)).toBeNull();
  });
});

describe("normaliseRoutePath", () => {
  it("folds ids so one route is one issue", () => {
    expect(normaliseRoutePath("/api/orders/8d6677b3-8b78-4ed5-a384-d4e5b80606d0/feedback?x=1")).toBe("/api/orders/:id/feedback");
    expect(normaliseRoutePath("/app/orders/123")).toBe("/app/orders/:id");
  });
});

describe("scrubMessage", () => {
  it("never stores an email address or a phone number from an error's wording", () => {
    const out = scrubMessage('Key (email)=(ama@example.com) already exists; call +233 24 555 0192');
    expect(out).not.toContain("ama@example.com");
    expect(out).not.toContain("555 0192");
  });

  it("scrubbing does not split one issue into two", () => {
    expect(fingerprintOf(scrubMessage("dup for ama@x.com"), null)).toBe(fingerprintOf(scrubMessage("dup for kofi@y.org"), null));
  });
});

describe("categorise", () => {
  it("prefers an explicit category", () => {
    expect(categorise("anything", null, "payment")).toBe("payment");
  });

  it("guesses from the source and the words for older call sites", () => {
    expect(categorise("x failed", "cron:catalog-scrape")).toBe("job");
    expect(categorise("Paystack verification failed", null)).toBe("payment");
    expect(categorise("400 from PATCH /api/app/me: bad", "client:4xx PATCH /api/app/me")).toBe("client_4xx");
    expect(categorise("Cannot read x", "client:window /app")).toBe("client_crash");
    expect(categorise("boom", "api:/api/app/me")).toBe("server_5xx");
    expect(categorise("boom", null)).toBe("server");
  });

  it("files a payment route's 5xx as a payment fault", () => {
    expect(apiCategory("/api/payments/webhook/paystack")).toBe("payment");
    expect(apiCategory("/api/app/me")).toBe("server_5xx");
    expect(apiCategory(null)).toBe("server_5xx");
  });
});
