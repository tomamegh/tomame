import { describe, expect, it } from "vitest";

import { DEFAULT_WINDOW_SLOTS, clockText, parseWindowSlots, slotText, windowProblem, windowText } from "../delivery-windows";

describe("delivery windows", () => {
  it("reads the admin's slots and falls back to the agreed three", () => {
    expect(parseWindowSlots([{ key: "am", label: "Early", from: "07:00", to: "09:30" }])).toEqual([{ key: "am", label: "Early", from: "07:00", to: "09:30" }]);
    expect(parseWindowSlots([{ key: "x", label: "Bad", from: "9am", to: "12" }, null, "nope"])).toEqual(DEFAULT_WINDOW_SLOTS);
    expect(parseWindowSlots(undefined).map((s) => s.key)).toEqual(["morning", "afternoon", "evening"]);
  });

  it("words slots and clock times the way people say them", () => {
    expect(clockText("09:00")).toBe("9am");
    expect(clockText("12:30")).toBe("12:30pm");
    expect(slotText(DEFAULT_WINDOW_SLOTS[0]!)).toBe("Morning, 9am–12pm");
    expect(slotText(DEFAULT_WINDOW_SLOTS[1]!)).toBe("Afternoon, 12–3pm");
    expect(slotText(DEFAULT_WINDOW_SLOTS[2]!)).toBe("Evening, 3–6pm");
  });

  it("names the day of a staff window relative to now", () => {
    const now = new Date("2026-11-24T08:00:00Z");
    expect(windowText("2026-11-24T13:00:00Z", "2026-11-24T15:00:00Z", now)).toBe("today, 1–3pm");
    expect(windowText("2026-11-25T11:00:00Z", "2026-11-25T13:00:00Z", now)).toBe("tomorrow, 11am–1pm");
    expect(windowText("2026-11-27T09:30:00Z", "2026-11-27T11:30:00Z", now)).toBe("Fri 27 Nov, 9:30–11:30am");
  });

  it("refuses windows that are back to front, too long, too short or over", () => {
    const now = new Date("2026-11-24T08:00:00Z");
    expect(windowProblem("2026-11-24T13:00:00Z", "2026-11-24T15:00:00Z", now)).toBeNull();
    expect(windowProblem("2026-11-24T15:00:00Z", "2026-11-24T13:00:00Z", now)).toMatch(/end after/);
    expect(windowProblem("2026-11-24T09:00:00Z", "2026-11-24T14:00:00Z", now)).toMatch(/three hours/);
    expect(windowProblem("2026-11-24T09:00:00Z", "2026-11-24T09:15:00Z", now)).toMatch(/half an hour/);
    expect(windowProblem("2026-11-23T09:00:00Z", "2026-11-23T11:00:00Z", now)).toMatch(/over/);
  });
});
