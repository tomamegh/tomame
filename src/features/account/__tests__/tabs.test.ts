import { describe, expect, it } from "vitest";

import { formatNotificationEvent, formatNotificationStamp, formatUnreadCount } from "../format";
import { ACCOUNT_TABS, ACCOUNT_TAB_KEYS, accountTab, accountTabHref, resolveAccountTab } from "../tabs";

describe("resolveAccountTab", () => {
  it.each(ACCOUNT_TAB_KEYS)("resolves %s to itself", (key) => {
    expect(resolveAccountTab(key)).toBe(key);
  });

  it("falls back to Profile for anything it does not recognise", () => {
    // `?tab=` is user input and arrives from links we do not control.
    expect(resolveAccountTab(undefined)).toBe("profile");
    expect(resolveAccountTab("")).toBe("profile");
    expect(resolveAccountTab("billing")).toBe("profile");
    expect(resolveAccountTab("../../etc/passwd")).toBe("profile");
  });

  it("takes the first value when the param is repeated", () => {
    // Next hands a repeated query param back as an array.
    expect(resolveAccountTab(["security", "profile"])).toBe("security");
    expect(resolveAccountTab([])).toBe("profile");
    expect(resolveAccountTab(["nonsense"])).toBe("profile");
  });
});

describe("accountTabHref", () => {
  it("leaves Profile as the bare route, so /app/account is not a redirect", () => {
    expect(accountTabHref("profile")).toBe("/app/account");
  });

  it("names every other tab in the query string", () => {
    expect(accountTabHref("addresses")).toBe("/app/account?tab=addresses");
    expect(accountTabHref("watch")).toBe("/app/account?tab=watch");
  });

  it("round-trips through the resolver for every tab", () => {
    for (const key of ACCOUNT_TAB_KEYS) {
      const href = accountTabHref(key);
      const param = new URL(href, "https://tomame.test").searchParams.get("tab") ?? undefined;
      expect(resolveAccountTab(param)).toBe(key);
    }
  });
});

describe("the tab table", () => {
  it("has one entry per key, with a blurb and a mobile label", () => {
    expect(ACCOUNT_TABS).toHaveLength(ACCOUNT_TAB_KEYS.length);
    for (const key of ACCOUNT_TAB_KEYS) {
      const tab = accountTab(key);
      expect(tab.key).toBe(key);
      expect(tab.blurb.length).toBeGreaterThan(0);
      // The 390px rail scrolls horizontally; a long label pushes the next tab
      // off the edge where nobody finds it.
      expect(tab.shortLabel.length).toBeLessThanOrEqual(10);
    }
  });
});

describe("notification display", () => {
  it("turns a machine event name into words", () => {
    expect(formatNotificationEvent("order_placed")).toBe("Order placed");
    expect(formatNotificationEvent("payment_succeeded")).toBe("Payment succeeded");
  });

  it("drops the _admin suffix, which names copy sent to staff and not to the customer", () => {
    expect(formatNotificationEvent("order_placed_admin")).toBe("Order placed");
  });

  it("shows an unknown event as its own words rather than as 'Notification'", () => {
    expect(formatNotificationEvent("box_departed_accra")).toBe("Box departed accra");
    expect(formatNotificationEvent("")).toBe("Notification");
  });

  it("stamps a notification with date and time, because many arrive in one day", () => {
    expect(formatNotificationStamp("2026-09-13T14:32:00Z")).toMatch(/^13 Sept? 2026, \d{2}:\d{2}$/);
    expect(formatNotificationStamp("rubbish")).toBe("rubbish");
  });

  it("drops the unread badge at zero instead of announcing '0 unread'", () => {
    expect(formatUnreadCount(0)).toBeNull();
    expect(formatUnreadCount(-2)).toBeNull();
    expect(formatUnreadCount(Number.NaN)).toBeNull();
    expect(formatUnreadCount(1)).toBe("1 unread");
    expect(formatUnreadCount(12)).toBe("12 unread");
  });
});
