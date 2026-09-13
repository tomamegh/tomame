import { describe, expect, it } from "vitest";

import {
  notificationEventLabel,
  notificationStatusBadge,
  recipientLabel,
  relativeTime,
  stuckPendingLabel,
  summariseEvents,
} from "../components/admin-notification-format";

const NOW = new Date("2026-09-13T12:00:00Z");

describe("notificationEventLabel", () => {
  it("names the events the platform actually sends", () => {
    expect(notificationEventLabel("order_placed")).toBe("Order placed");
    expect(notificationEventLabel("price_drop")).toBe("Price drop");
    expect(notificationEventLabel("paste_priced")).toBe("Paste priced");
    expect(notificationEventLabel("paste_unreadable")).toBe("Paste unreadable");
  });

  it("humanises an event it has never seen rather than hiding the row", () => {
    // A new event type must still be readable in the log the day it ships.
    expect(notificationEventLabel("box_departed")).toBe("Box departed");
  });
});

describe("notificationStatusBadge", () => {
  it("keeps amber for pending and spends coral on failure", () => {
    // Amber means a person still owes an action; a failed send is already
    // wrong, not queued.
    expect(notificationStatusBadge("pending").tone).toBe("amber");
    expect(notificationStatusBadge("failed").tone).toBe("coral");
    expect(notificationStatusBadge("sent").tone).toBe("green");
  });
});

describe("recipientLabel", () => {
  it("prefers the profile name", () => {
    expect(recipientLabel({ first_name: "Ama", last_name: "Mensah" }, "abcdef12-…")).toBe(
      "Ama Mensah",
    );
  });

  it("falls back to a short account id, not to the word Unknown", () => {
    expect(recipientLabel(null, "abcdef1234567890")).toBe("Account abcdef12");
    expect(recipientLabel({ first_name: null, last_name: null }, "abcdef1234567890")).toBe(
      "Account abcdef12",
    );
  });

  it("copes with only one half of a name", () => {
    expect(recipientLabel({ first_name: "Ama", last_name: null }, "abcdef12")).toBe("Ama");
  });
});

describe("relativeTime", () => {
  it("scales from minutes to months", () => {
    expect(relativeTime("2026-09-13T11:59:40Z", NOW)).toBe("just now");
    expect(relativeTime("2026-09-13T11:30:00Z", NOW)).toBe("30 min ago");
    expect(relativeTime("2026-09-13T06:00:00Z", NOW)).toBe("6 h ago");
    expect(relativeTime("2026-09-08T12:00:00Z", NOW)).toBe("5 d ago");
    expect(relativeTime("2026-07-01T12:00:00Z", NOW)).toBe("2 mo ago");
  });

  it("returns null on junk instead of Invalid Date", () => {
    expect(relativeTime("not-a-date", NOW)).toBeNull();
  });

  it("does not print a negative age when a clock has drifted forward", () => {
    expect(relativeTime("2026-09-13T12:05:00Z", NOW)).toBe("just now");
  });
});

describe("stuckPendingLabel", () => {
  it("says nothing under the hour", () => {
    // A row is pending for milliseconds in the normal case; warning about it
    // immediately would make every fresh send look broken.
    expect(stuckPendingLabel("2026-09-13T11:30:00Z", NOW)).toBeNull();
  });

  it("reports hours, then days", () => {
    expect(stuckPendingLabel("2026-09-13T09:00:00Z", NOW)).toBe("Pending for 3 hours");
    expect(stuckPendingLabel("2026-09-13T11:00:00Z", NOW)).toBe("Pending for 1 hour");
    expect(stuckPendingLabel("2026-09-10T12:00:00Z", NOW)).toBe("Pending for 3 days");
  });
});

describe("summariseEvents", () => {
  it("puts the failing event first even when it is the rarest", () => {
    const rows = [
      { event: "order_placed", status: "sent" as const },
      { event: "order_placed", status: "sent" as const },
      { event: "order_placed", status: "sent" as const },
      { event: "price_drop", status: "failed" as const },
      { event: "price_drop", status: "sent" as const },
    ];

    const summary = summariseEvents(rows);
    expect(summary[0]).toMatchObject({ event: "price_drop", failed: 1, sent: 1, total: 2 });
    expect(summary[1]).toMatchObject({ event: "order_placed", failed: 0, total: 3 });
  });

  it("counts pending separately from failed", () => {
    const summary = summariseEvents([
      { event: "paste_priced", status: "pending" },
      { event: "paste_priced", status: "failed" },
    ]);
    expect(summary[0]).toMatchObject({ pending: 1, failed: 1, sent: 0, total: 2 });
  });

  it("is empty for no rows", () => {
    expect(summariseEvents([])).toEqual([]);
  });
});
