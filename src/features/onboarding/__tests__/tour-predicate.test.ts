import { describe, expect, it } from "vitest";

import { shouldShowOnboardingTour, type OnboardingTourViewer } from "../tour-predicate";

/** A fresh, first-time customer on Home — the one case that must say yes. */
function baseViewer(overrides: Partial<OnboardingTourViewer> = {}): OnboardingTourViewer {
  return {
    tourEnabled: true,
    isAuthenticated: true,
    pathname: "/app",
    hasPaymentReturnParam: false,
    onboardingCompletedAt: null,
    onboardingDismissedAt: null,
    ...overrides,
  };
}

describe("shouldShowOnboardingTour", () => {
  it("fires for a fresh, signed-in, first-time visit to /app", () => {
    expect(shouldShowOnboardingTour(baseViewer())).toBe(true);
  });

  it("never fires for a signed-out visitor, regardless of everything else", () => {
    expect(
      shouldShowOnboardingTour(
        baseViewer({
          isAuthenticated: false,
          onboardingCompletedAt: null,
          onboardingDismissedAt: null,
              }),
      ),
    ).toBe(false);
  });

  it("never fires once onboarding_completed_at is set", () => {
    expect(
      shouldShowOnboardingTour(baseViewer({ onboardingCompletedAt: "2026-09-01T00:00:00Z" })),
    ).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ onboardingCompletedAt: new Date() }))).toBe(
      false,
    );
  });

  it("never fires once onboarding_dismissed_at is set", () => {
    expect(
      shouldShowOnboardingTour(baseViewer({ onboardingDismissedAt: "2026-09-01T00:00:00Z" })),
    ).toBe(false);
  });

  it("never fires when both timestamps are set", () => {
    expect(
      shouldShowOnboardingTour(
        baseViewer({
          onboardingCompletedAt: "2026-09-01T00:00:00Z",
          onboardingDismissedAt: "2026-09-02T00:00:00Z",
        }),
      ),
    ).toBe(false);
  });

  it("STILL fires for a customer who already has orders but has never seen it", () => {
    // Deliberately NOT a rule: an existing customer who has never seen the
    // tour still gets it. What somebody has bought is not evidence of what
    // they have been shown, and every account on production has orders.
    expect(shouldShowOnboardingTour(baseViewer())).toBe(true);
  });

  it("never fires when the admin has turned the tour off", () => {
    expect(shouldShowOnboardingTour(baseViewer({ tourEnabled: false }))).toBe(false);
  });

  it("stays off when the switch is off even for somebody who has never seen it", () => {
    expect(
      shouldShowOnboardingTour(
        baseViewer({ tourEnabled: false, onboardingCompletedAt: null, onboardingDismissedAt: null }),
      ),
    ).toBe(false);
  });

  it("never fires on /app/bag", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/bag" }))).toBe(false);
  });

  it("never fires on /app/bag with a trailing slash", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/bag/" }))).toBe(false);
  });

  it("never fires under /app/bag/*", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/bag/checkout" }))).toBe(false);
  });

  it("starts only on Home, so a merely-similar path does not start it either", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/bagpipes" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app" }))).toBe(true);
  });

  it("never fires on a checkout return (?payment= present)", () => {
    expect(
      shouldShowOnboardingTour(
        baseViewer({ pathname: "/app/orders", hasPaymentReturnParam: true }),
      ),
    ).toBe(false);
  });

  it("does not start on /app/orders even without a payment param: only Home starts it", () => {
    expect(
      shouldShowOnboardingTour(
        baseViewer({ pathname: "/app/orders", hasPaymentReturnParam: false }),
      ),
    ).toBe(false);
  });

  it("fires on other /app/* routes, not just the literal /app root", () => {
    // Only Home starts it: anywhere else the customer is mid-task (2026-11-23).
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/watches" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/account" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/orders/new" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/find/chat/c85873bd-5a11-4e67-a189-f19588a048fd" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/orders/review/3e49c960-15a4-4db4-a268-4be4a6c6336e" }))).toBe(false);
  });

  it("never fires outside the signed-in app shell", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/admin" }))).toBe(false);
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/fees" }))).toBe(false);
  });

  it("never fires for a null pathname", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: null }))).toBe(false);
  });

  it("never fires for an empty-string pathname", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "" }))).toBe(false);
  });

  it("treats /app/ (trailing slash) the same as /app", () => {
    expect(shouldShowOnboardingTour(baseViewer({ pathname: "/app/" }))).toBe(true);
  });

  it("stacks every exclusion at once without false-positiving", () => {
    expect(
      shouldShowOnboardingTour({
        tourEnabled: false,
        isAuthenticated: true,
        pathname: "/app/bag",
        hasPaymentReturnParam: true,
        onboardingCompletedAt: "2026-01-01T00:00:00Z",
        onboardingDismissedAt: "2026-01-02T00:00:00Z",
      }),
    ).toBe(false);
  });
});
