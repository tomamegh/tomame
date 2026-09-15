import { describe, expect, it } from "vitest";

import { askedAgo, describeAsk } from "../ask-format";

const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("askedAgo", () => {
  it("writes the age in words, because a customer reads it", () => {
    expect(askedAgo("2026-09-15T11:59:40.000Z", NOW)).toBe("just now");
    expect(askedAgo("2026-09-15T11:59:00.000Z", NOW)).toBe("1 minute ago");
    expect(askedAgo("2026-09-15T11:36:00.000Z", NOW)).toBe("24 minutes ago");
    expect(askedAgo("2026-09-15T09:00:00.000Z", NOW)).toBe("3 hours ago");
    expect(askedAgo("2026-09-14T11:00:00.000Z", NOW)).toBe("1 day ago");
    expect(askedAgo("2026-09-10T12:00:00.000Z", NOW)).toBe("5 days ago");
  });

  it("reads a clock skewed into the future as just now rather than a negative age", () => {
    expect(askedAgo("2026-09-15T12:00:20.000Z", NOW)).toBe("just now");
  });

  it("says nothing at all about an unparseable timestamp", () => {
    expect(askedAgo("not a date", NOW)).toBeNull();
  });
});

describe("describeAsk", () => {
  it("does not claim a buyer is on it before one has picked it up", () => {
    const summary = describeAsk({ status: "open", requested_at: "2026-09-15T11:55:00.000Z" }, NOW);
    expect(summary.title).toBe("With our buyers");
    expect(summary.tone).toBe("amber");
    expect(summary.detail).toContain("5 minutes ago");
  });

  it("says a buyer has it only once one has been in touch", () => {
    const summary = describeAsk(
      { status: "contacted", requested_at: "2026-09-15T10:00:00.000Z" },
      NOW,
    );
    expect(summary.title).toBe("A buyer is on it");
    expect(summary.tone).toBe("green");
    expect(summary.detail).toContain("2 hours ago");
  });

  it("still says where the request stands when its timestamp is unreadable", () => {
    const summary = describeAsk({ status: "open", requested_at: "" }, NOW);
    expect(summary.title).toBe("With our buyers");
    expect(summary.detail).not.toContain("You asked");
  });
});
