import { describe, expect, it } from "vitest";

import { parseSpecNote, wideSpread } from "../spec-spread";

const lg = [
  { title: "LG 55 inch Class OLED evo AI C6 4K Smart TV 2026", store: "Amazon", totalGhs: 20630.28 },
  { title: "LG UA7500 Series 55 Inch 4K UHD LED AI Smart TV", store: "Walmart", totalGhs: 6470.82 },
  { title: "LG 55 inch Class QNED AI QNED73B Mini LED 4K Smart TV 2026", store: "Amazon", totalGhs: 6830.01 },
];

describe("wideSpread — the LG 55 inch case", () => {
  it("flags GH₵6,470 against GH₵20,630, cheapest first", () => {
    const spread = wideSpread(lg);
    expect(spread?.map((o) => o.totalGhs)).toEqual([6470.82, 6830.01, 20630.28]);
  });

  it("stays quiet when the options are close, or there is only one", () => {
    expect(wideSpread(lg.slice(1))).toBeNull();
    expect(wideSpread(lg.slice(0, 1))).toBeNull();
    expect(wideSpread([])).toBeNull();
  });
});

describe("parseSpecNote", () => {
  it("trims, drops empty, and bounds the length", () => {
    expect(parseSpecNote({ note: "  The C6 is an OLED.  " })).toBe("The C6 is an OLED.");
    expect(parseSpecNote({ note: "   " })).toBeNull();
    expect(parseSpecNote(null)).toBeNull();
    expect(parseSpecNote({ note: "x".repeat(500) })?.length).toBe(398);
  });
});
