import { describe, it, expect } from "vitest";

import { ORDER_STATUSES } from "@/config/constants";
import {
  JOURNEY_TONE_BADGE_CLASS,
  ORDER_STATUS_OPTIONS,
  journeyStageFor,
} from "../services/journey-stage";


describe("the one status vocabulary", () => {
  it("covers every status in the enum, so a new one cannot go missing from a filter", () => {
    expect(ORDER_STATUS_OPTIONS.map((o) => o.value).sort()).toEqual(
      Object.values(ORDER_STATUSES).sort(),
    );
  });

  it("labels each status with the same words journeyStageFor uses", () => {
    for (const option of ORDER_STATUS_OPTIONS) {
      expect(option.label).toBe(journeyStageFor(option.value).label);
    }
  });

  it("keeps the customer's vocabulary, not the database's", () => {
    const label = (v: string) => ORDER_STATUS_OPTIONS.find((o) => o.value === v)?.label;
    // The five duplicate maps said "In Transit" and "Processing"; the customer's
    // journey said "In the air" and "Being purchased". One of them had to win.
    expect(label("in_transit")).toBe("In the air");
    expect(label("processing")).toBe("Being purchased");
  });

  it("gives every tone a badge class, including the ones off the track", () => {
    for (const tone of ["coral", "amber", "green", "neutral"] as const) {
      expect(JOURNEY_TONE_BADGE_CLASS[tone]).toBeTruthy();
    }
  });
});
