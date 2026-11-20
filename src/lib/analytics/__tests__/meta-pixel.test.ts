import { afterEach, describe, expect, it, vi } from "vitest";

import { installMetaPixel, isMetaPixelPath, trackMetaEvent } from "../meta-pixel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isMetaPixelPath", () => {
  it("tracks customer pages and skips the staff consoles", () => {
    expect(isMetaPixelPath("/")).toBe(true);
    expect(isMetaPixelPath("/app/bag")).toBe(true);
    expect(isMetaPixelPath("/app/orders/abc")).toBe(true);
    expect(isMetaPixelPath("/admin")).toBe(false);
    expect(isMetaPixelPath("/admin/orders/1")).toBe(false);
    expect(isMetaPixelPath("/warehouse/boxes")).toBe(false);
    expect(isMetaPixelPath("/delivery")).toBe(false);
    // A prefix match, not a substring: `/administer` is not the console.
    expect(isMetaPixelPath("/administer")).toBe(true);
  });
});

describe("trackMetaEvent", () => {
  it("is a no-op when the pixel is not installed", () => {
    vi.stubGlobal("window", {});
    expect(() => trackMetaEvent("AddToCart", { value: 10, currency: "GHS" })).not.toThrow();
  });

  it("queues init before any event, and passes eventID for dedupe", () => {
    const win: Record<string, unknown> = {};
    vi.stubGlobal("window", win);
    installMetaPixel("123");
    installMetaPixel("123"); // idempotent: one init
    trackMetaEvent("PageView");
    trackMetaEvent("Purchase", { value: 250.5, currency: "GHS" }, "group:g1");

    const fbq = win.fbq as { queue: unknown[][] };
    expect(fbq.queue).toEqual([
      ["init", "123"],
      ["track", "PageView"],
      ["track", "Purchase", { value: 250.5, currency: "GHS" }, { eventID: "group:g1" }],
    ]);
  });

  it("never throws into the caller when fbq does", () => {
    vi.stubGlobal("window", {
      fbq: () => {
        throw new Error("blocked");
      },
    });
    expect(() => trackMetaEvent("InitiateCheckout")).not.toThrow();
  });
});
