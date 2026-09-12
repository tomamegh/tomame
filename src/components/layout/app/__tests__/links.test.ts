import { describe, expect, it } from "vitest";

import {
  APP_NAV_ITEMS,
  avatarInitial,
  formatGreeting,
  formatMovingParcels,
  formatRatePill,
  greetingForHour,
  notificationsLabel,
  ownsMobileBottomBar,
  resolveActiveAppNavKey,
} from "../links";

describe("resolveActiveAppNavKey", () => {
  it("matches each tab on its own route", () => {
    expect(resolveActiveAppNavKey("/app")).toBe("home");
    expect(resolveActiveAppNavKey("/app/orders/new")).toBe("shop");
    expect(resolveActiveAppNavKey("/app/watches")).toBe("ship");
    expect(resolveActiveAppNavKey("/app/orders")).toBe("orders");
  });

  it("prefers the most specific href when two destinations overlap", () => {
    // "/app/orders/new" sits underneath "/app/orders"; a first-match-wins scan
    // would highlight Journeys while the customer is on the Buy screen.
    expect(resolveActiveAppNavKey("/app/orders/new")).toBe("shop");
  });

  it("keeps Journeys highlighted on a nested journey route", () => {
    expect(resolveActiveAppNavKey("/app/orders/abc-123")).toBe("orders");
    expect(resolveActiveAppNavKey("/app/orders/abc-123/checkout")).toBe(
      "orders",
    );
    expect(resolveActiveAppNavKey("/app/orders/review/abc-123")).toBe("orders");
  });

  it("matches /app only exactly, never as a prefix of another tab", () => {
    expect(resolveActiveAppNavKey("/app")).toBe("home");
    expect(resolveActiveAppNavKey("/app/")).toBe("home");
    expect(resolveActiveAppNavKey("/app/watches")).not.toBe("home");
  });

  it("returns null for app routes with no tab of their own", () => {
    expect(resolveActiveAppNavKey("/app/account")).toBeNull();
    expect(resolveActiveAppNavKey("/app/transactions")).toBeNull();
    expect(resolveActiveAppNavKey("/app/products")).toBeNull();
  });

  it("returns null outside the app and for a null pathname", () => {
    expect(resolveActiveAppNavKey("/fees")).toBeNull();
    expect(resolveActiveAppNavKey("/")).toBeNull();
    expect(resolveActiveAppNavKey(null)).toBeNull();
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(resolveActiveAppNavKey("/app-status")).toBeNull();
    expect(resolveActiveAppNavKey("/app/watchlist")).toBeNull();
  });

  it("honours a caller-supplied item list", () => {
    const items = [
      {
        key: "home" as const,
        label: "Start",
        mobileLabel: "Start",
        href: "/start",
        icon: "house" as const,
      },
    ];
    expect(resolveActiveAppNavKey("/start", items)).toBe("home");
    expect(resolveActiveAppNavKey("/app", items)).toBeNull();
  });

  it("exposes the four tabs the mock shows, in order", () => {
    expect(APP_NAV_ITEMS.map((item) => item.key)).toEqual([
      "home",
      "shop",
      "ship",
      "orders",
    ]);
  });

  it("gives every tab a route and shortens two labels for mobile", () => {
    for (const item of APP_NAV_ITEMS) {
      expect(item.href.startsWith("/app")).toBe(true);
    }
    const mobile = Object.fromEntries(
      APP_NAV_ITEMS.map((item) => [item.key, item.mobileLabel]),
    );
    expect(mobile.shop).toBe("Buy");
    expect(mobile.ship).toBe("Watch");
  });
});

describe("greetingForHour", () => {
  it("splits the day into morning, afternoon and evening", () => {
    expect(greetingForHour(0)).toBe("Morning");
    expect(greetingForHour(11)).toBe("Morning");
    expect(greetingForHour(12)).toBe("Afternoon");
    expect(greetingForHour(16)).toBe("Afternoon");
    expect(greetingForHour(17)).toBe("Evening");
    expect(greetingForHour(23)).toBe("Evening");
  });

  it("falls back to a neutral greeting for an impossible hour", () => {
    expect(greetingForHour(-1)).toBe("Hello");
    expect(greetingForHour(24)).toBe("Hello");
    expect(greetingForHour(Number.NaN)).toBe("Hello");
  });
});

describe("formatGreeting", () => {
  it("uses the customer's first name when there is one", () => {
    expect(formatGreeting(14, "Kwame")).toBe("Afternoon, Kwame");
  });

  it("drops the name rather than greeting an empty string", () => {
    expect(formatGreeting(14, null)).toBe("Afternoon");
    expect(formatGreeting(14, "   ")).toBe("Afternoon");
  });
});

describe("formatMovingParcels", () => {
  it("pluralises on the count", () => {
    expect(formatMovingParcels(1)).toBe("1 parcel moving");
    expect(formatMovingParcels(2)).toBe("2 parcels moving");
  });

  it("returns null at zero so the chip drops the clause", () => {
    expect(formatMovingParcels(0)).toBeNull();
    expect(formatMovingParcels(-3)).toBeNull();
    expect(formatMovingParcels(Number.NaN)).toBeNull();
  });
});

describe("avatarInitial", () => {
  it("takes the first letter, upper-cased", () => {
    expect(avatarInitial("kwame")).toBe("K");
    expect(avatarInitial("  ama  ")).toBe("A");
  });

  it("returns null when there is no usable name", () => {
    expect(avatarInitial(null)).toBeNull();
    expect(avatarInitial("")).toBeNull();
    expect(avatarInitial("   ")).toBeNull();
  });

  it("does not slice an astral character in half", () => {
    // "[0]" on this string yields a lone surrogate, which renders as a tofu box.
    expect(avatarInitial("𝒦wame")).toBe("𝒦");
  });
});

describe("formatRatePill", () => {
  it("renders the mock's shape for USD", () => {
    expect(formatRatePill("USD", 14.43)).toBe("$1 = GH₵14.43");
  });

  it("uses the right symbol for the other supported currencies", () => {
    expect(formatRatePill("GBP", 18.2)).toBe("£1 = GH₵18.20");
    expect(formatRatePill("CNY", 2)).toBe("¥1 = GH₵2.00");
  });

  it("falls back to the currency code for anything unrecognised", () => {
    expect(formatRatePill("EUR", 15.5)).toBe("1 EUR = GH₵15.50");
  });

  it("returns null rather than showing an invented rate", () => {
    expect(formatRatePill("USD", null)).toBeNull();
    expect(formatRatePill("USD", 0)).toBeNull();
    expect(formatRatePill("USD", -1)).toBeNull();
    expect(formatRatePill("USD", Number.NaN)).toBeNull();
  });
});

describe("notificationsLabel", () => {
  it("announces the unread count instead of relying on a coloured dot", () => {
    expect(notificationsLabel(3)).toBe("Notifications, 3 unread");
  });

  it("stays plain when there is nothing unread", () => {
    expect(notificationsLabel(0)).toBe("Notifications");
    expect(notificationsLabel(Number.NaN)).toBe("Notifications");
  });
});

describe("ownsMobileBottomBar", () => {
  it("stands the tab bar down on the landed-price screen", () => {
    expect(ownsMobileBottomBar("/app/orders/review/abc-123")).toBe(true);
    expect(ownsMobileBottomBar("/app/orders/review")).toBe(true);
    expect(ownsMobileBottomBar("/app/orders/review/")).toBe(true);
  });

  it("leaves the tab bar alone everywhere else in the app", () => {
    expect(ownsMobileBottomBar("/app")).toBe(false);
    expect(ownsMobileBottomBar("/app/orders")).toBe(false);
    expect(ownsMobileBottomBar("/app/orders/new")).toBe(false);
    expect(ownsMobileBottomBar("/app/orders/abc-123/checkout")).toBe(false);
    expect(ownsMobileBottomBar("/app/watches")).toBe(false);
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(ownsMobileBottomBar("/app/orders/reviews")).toBe(false);
    expect(ownsMobileBottomBar(null)).toBe(false);
  });
});
