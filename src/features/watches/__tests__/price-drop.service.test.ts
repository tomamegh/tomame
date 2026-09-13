import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: { app: { url: "https://tomame.test" } },
}));

// Resend is NEVER reached from a test. `sendEmail` is the only door out of the
// process and it is stubbed here; anything that would put a real message on the
// wire has to go through it, so a missing mock shows up as a call count, not as
// mail in somebody's inbox.
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));

vi.mock("@/db/queries/pricing-constants", () => ({ getPricingConstantsMap: vi.fn() }));

vi.mock("@/db/queries/notifications", () => ({
  insertNotification: vi.fn(),
  markNotificationDelivered: vi.fn(),
  getRecipientEmail: vi.fn(),
}));

vi.mock("@/db/queries/price-watches", () => ({ markWatchNotified: vi.fn() }));

import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/transport";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { markWatchNotified, type PriceWatchRow } from "@/db/queries/price-watches";
import {
  decidePriceDrop,
  notifyPriceDrop,
  resolveDropThreshold,
  tryNotifyPriceDrop,
} from "../services/price-drop.service";

const mockSend = vi.mocked(sendEmail);
const mockConstants = vi.mocked(getPricingConstantsMap);
const mockInsertNotification = vi.mocked(insertNotification);
const mockMarkDelivered = vi.mocked(markNotificationDelivered);
const mockRecipient = vi.mocked(getRecipientEmail);
const mockMarkNotified = vi.mocked(markWatchNotified);

const USER = "11111111-1111-1111-1111-111111111111";
const THRESHOLD = 0.03;
const NOW = new Date("2026-09-13T06:10:00.000Z");

function watchRow(overrides: Partial<PriceWatchRow> = {}): PriceWatchRow {
  return {
    id: "watch-1",
    user_id: USER,
    product_url: "https://www.amazon.com/dp/B0CHX1W1XY",
    url_hash: "hash-1",
    product_name: "Sony WH-1000XM5",
    product_image_url: "https://img.example/1.jpg",
    extraction_cache_id: "cache-1",
    baseline_price_usd: 400,
    baseline_total_ghs: 6000,
    last_price_usd: 400,
    last_total_ghs: 6000,
    last_checked_at: "2026-09-12T06:00:00.000Z",
    consecutive_failures: 0,
    last_error: null,
    notify_on_drop: true,
    notified_at: null,
    notified_price_usd: null,
    is_active: true,
    created_at: "2026-09-01T06:00:00.000Z",
    updated_at: "2026-09-12T06:00:00.000Z",
    ...overrides,
  };
}

function reading(priceUsd: number) {
  return { priceUsd, totalGhs: priceUsd * 15, exchangeRate: 15 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConstants.mockResolvedValue({ price_drop_notify_pct: THRESHOLD });
  mockRecipient.mockResolvedValue("kwame@example.com");
  mockInsertNotification.mockResolvedValue({ id: "notif-1" } as never);
  mockMarkDelivered.mockResolvedValue(undefined);
  mockMarkNotified.mockResolvedValue(undefined);
  mockSend.mockResolvedValue(undefined as never);
});

// ── The rule ────────────────────────────────────────────────────────────────

describe("decidePriceDrop", () => {
  it("alerts on a fall of at least the threshold below the baseline, the first time", async () => {
    const decision = decidePriceDrop(watchRow(), 380, THRESHOLD);

    expect(decision.notify).toBe(true);
    expect(decision.reference_price_usd).toBe(400);
    expect(decision.drop_pct).toBeCloseTo(0.05, 5);
  });

  it("stays quiet on a fall that does not reach the threshold", () => {
    // 400 → 390 is 2.5%: real, but inside the noise a coupon expiring makes.
    expect(decidePriceDrop(watchRow(), 390, THRESHOLD)).toMatchObject({
      notify: false,
      reason: "below_threshold",
    });
  });

  it("stays quiet when the price rose or held", () => {
    expect(decidePriceDrop(watchRow(), 400, THRESHOLD).reason).toBe("no_drop");
    expect(decidePriceDrop(watchRow(), 450, THRESHOLD).reason).toBe("no_drop");
  });

  it("measures against the last NOTIFIED price, not the baseline", () => {
    // The customer has already been told about $360. $355 is 11% under the
    // $400 baseline and would re-alert under a baseline rule; it is 1.4% under
    // what they actually know, so it is not news.
    const watch = watchRow({ notified_price_usd: 360, notified_at: "2026-09-12T06:10:00.000Z" });

    expect(decidePriceDrop(watch, 355, THRESHOLD)).toMatchObject({
      notify: false,
      reason: "below_threshold",
      reference_price_usd: 360,
    });
  });

  it("alerts again only on a FURTHER drop of the threshold below the notified price", () => {
    const watch = watchRow({ notified_price_usd: 360, notified_at: "2026-09-12T06:10:00.000Z" });

    expect(decidePriceDrop(watch, 349, THRESHOLD)).toMatchObject({
      notify: true,
      reference_price_usd: 360,
    });
  });

  it("does not re-alert for a price that simply STAYS low — the reason this column exists", () => {
    // Five consecutive runs at the same low price. Under "below the baseline"
    // this is five emails; under the real rule it is none after the first.
    const watch = watchRow({ notified_price_usd: 360, notified_at: "2026-09-12T06:10:00.000Z" });

    for (let run = 0; run < 5; run++) {
      expect(decidePriceDrop(watch, 360, THRESHOLD).notify).toBe(false);
    }
  });

  it("does not re-alert when the price rises and then falls back to the same level", () => {
    // $400 → alert at $360 → back up to $395 → down to $360 again. The customer
    // already has "$360" in their inbox; the round trip told them nothing new,
    // and emailing it again is how a price watch becomes a spam folder.
    const watch = watchRow({ notified_price_usd: 360, notified_at: "2026-09-12T06:10:00.000Z" });

    expect(decidePriceDrop(watch, 395, THRESHOLD).reason).toBe("no_drop");
    expect(decidePriceDrop(watch, 360, THRESHOLD)).toMatchObject({
      notify: false,
      reason: "no_drop",
      reference_price_usd: 360,
    });
  });

  it("alerts when the recovery overshoots and the NEXT fall clears the threshold", () => {
    // Same round trip, but it settles at $340 — 5.6% below what was announced.
    // That is new information and must not be suppressed.
    const watch = watchRow({ notified_price_usd: 360, notified_at: "2026-09-12T06:10:00.000Z" });

    expect(decidePriceDrop(watch, 340, THRESHOLD).notify).toBe(true);
  });

  it("honours the customer's own switch above everything else", () => {
    const watch = watchRow({ notify_on_drop: false });
    expect(decidePriceDrop(watch, 100, THRESHOLD)).toMatchObject({ notify: false, reason: "muted" });
  });

  it("has nothing to say about a watch with no baseline and no alert behind it", () => {
    const watch = watchRow({ baseline_price_usd: null, notified_price_usd: null });
    expect(decidePriceDrop(watch, 200, THRESHOLD).reason).toBe("no_reference");
  });

  it("rejects an unusable reading rather than reading it as a 100% drop", () => {
    expect(decidePriceDrop(watchRow(), 0, THRESHOLD).reason).toBe("no_reading");
    expect(decidePriceDrop(watchRow(), Number.NaN, THRESHOLD).reason).toBe("no_reading");
  });

  it("treats a NUMERIC that arrived as a string as the number it is", () => {
    // PostgREST hands NUMERIC back as a string often enough to matter.
    const watch = watchRow({ notified_price_usd: "360" as unknown as number });
    expect(decidePriceDrop(watch, 349, THRESHOLD)).toMatchObject({
      notify: true,
      reference_price_usd: 360,
    });
  });
});

// ── The threshold ───────────────────────────────────────────────────────────

describe("resolveDropThreshold", () => {
  it("comes from pricing_constants, not from code", async () => {
    mockConstants.mockResolvedValue({ price_drop_notify_pct: 0.08 });
    expect(await resolveDropThreshold()).toBe(0.08);
  });

  it("turns alerts off — loudly — when the row is missing", async () => {
    mockConstants.mockResolvedValue({ freight_rate_per_lb: 5 });

    expect(await resolveDropThreshold()).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("refuses a threshold of 0, which would email on every flat reading", async () => {
    mockConstants.mockResolvedValue({ price_drop_notify_pct: 0 });
    expect(await resolveDropThreshold()).toBeNull();
  });

  it("refuses a threshold of 1 or more, which no real price could clear", async () => {
    mockConstants.mockResolvedValue({ price_drop_notify_pct: 1 });
    expect(await resolveDropThreshold()).toBeNull();
  });

  it("lets a missing pricing_constants table through — that is a deploy bug", async () => {
    mockConstants.mockRejectedValue(
      new Error("Failed to load pricing constants: Could not find the table 'public.pricing_constants' in the schema cache"),
    );
    await expect(resolveDropThreshold()).rejects.toThrow(/could not find the table/i);
  });
});

// ── Sending ─────────────────────────────────────────────────────────────────

describe("notifyPriceDrop", () => {
  it("records the notification, sends it, and moves the reference point", async () => {
    const outcome = await notifyPriceDrop(watchRow(), reading(360), THRESHOLD, NOW);

    expect(outcome).toMatchObject({ notified: true, delivered: true });

    // pending BEFORE the transport, so a failed send still leaves a trace.
    expect(mockInsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER,
        channel: "email",
        event: "price_drop",
      }),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockMarkDelivered).toHaveBeenCalledWith("notif-1", {
      status: "sent",
      sent_at: NOW.toISOString(),
    });
    expect(mockMarkNotified).toHaveBeenCalledWith("watch-1", {
      notified_price_usd: 360,
      notified_at: NOW.toISOString(),
    });
  });

  it("stamps the price it actually quoted, so the next run measures from there", async () => {
    // The one write that makes re-notification safe. Feed the stamped value
    // back in and the same price must now be silent.
    await notifyPriceDrop(watchRow(), reading(360), THRESHOLD, NOW);

    const stamped = mockMarkNotified.mock.calls[0]?.[1].notified_price_usd;
    expect(stamped).toBe(360);

    mockSend.mockClear();
    const second = await notifyPriceDrop(
      watchRow({ notified_price_usd: stamped, notified_at: NOW.toISOString() }),
      reading(360),
      THRESHOLD,
      NOW,
    );

    expect(second).toMatchObject({ notified: false, reason: "no_drop" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("quotes real figures from the rows — the last notified price, this reading, the rate", async () => {
    await notifyPriceDrop(
      watchRow({ notified_price_usd: 400, notified_at: "2026-09-10T06:00:00.000Z" }),
      { priceUsd: 320, totalGhs: 5120, exchangeRate: 16 },
      THRESHOLD,
      NOW,
    );

    expect(mockInsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          watch_id: "watch-1",
          previous_price_usd: 400,
          current_price_usd: 320,
          current_total_ghs: 5120,
          exchange_rate: 16,
          drop_pct: 0.2,
        }),
      }),
    );

    const sent = mockSend.mock.calls[0]?.[0];
    expect(sent?.to).toBe("kwame@example.com");
    expect(sent?.subject).toContain("20%");
    // USD then-and-now, and the landed total at the rate that produced it.
    expect(sent?.html).toContain("$400.00");
    expect(sent?.html).toContain("$320.00");
    expect(sent?.html).toContain("5120.00");
    expect(sent?.html).toContain("1 USD = 16 GHS");
  });

  it("sends nothing when there is no threshold configured", async () => {
    const outcome = await notifyPriceDrop(watchRow(), reading(100), null, NOW);

    expect(outcome).toEqual({ notified: false, reason: "no_threshold" });
    expect(mockInsertNotification).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("writes no notification row at all when the drop is not worth an alert", async () => {
    await notifyPriceDrop(watchRow(), reading(395), THRESHOLD, NOW);

    expect(mockInsertNotification).not.toHaveBeenCalled();
    expect(mockMarkNotified).not.toHaveBeenCalled();
  });

  it("stops at the recipient when the customer has no address", async () => {
    mockRecipient.mockResolvedValue(null);

    expect(await notifyPriceDrop(watchRow(), reading(360), THRESHOLD, NOW)).toEqual({
      notified: false,
      reason: "no_recipient",
    });
    expect(mockInsertNotification).not.toHaveBeenCalled();
  });

  it("marks the row failed but still moves the reference when the transport rejects it", async () => {
    // Re-deciding the drop next run would retry a dead address every ten
    // minutes forever; re-delivery belongs to the notification layer.
    mockSend.mockRejectedValue(new Error("Resend error: domain not verified"));

    const outcome = await notifyPriceDrop(watchRow(), reading(360), THRESHOLD, NOW);

    expect(outcome).toMatchObject({ notified: true, delivered: false });
    expect(mockMarkDelivered).toHaveBeenCalledWith("notif-1", {
      status: "failed",
      sent_at: NOW.toISOString(),
    });
    expect(mockMarkNotified).toHaveBeenCalledWith("watch-1", {
      notified_price_usd: 360,
      notified_at: NOW.toISOString(),
    });
  });
});

describe("tryNotifyPriceDrop", () => {
  it("absorbs a broken notification so the price check that found it still stands", async () => {
    mockInsertNotification.mockRejectedValue(new Error("connection reset"));

    expect(await tryNotifyPriceDrop(watchRow(), reading(360), THRESHOLD)).toEqual({
      notified: false,
      reason: "error",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("still lets a missing table through — that one is a deploy bug", async () => {
    mockInsertNotification.mockRejectedValue(
      new Error("Failed to record notification: Could not find the table 'public.notifications' in the schema cache"),
    );

    await expect(tryNotifyPriceDrop(watchRow(), reading(360), THRESHOLD)).rejects.toThrow(
      /could not find the table/i,
    );
  });
});
