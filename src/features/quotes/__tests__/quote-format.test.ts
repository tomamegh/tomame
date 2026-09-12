import { describe, expect, it } from "vitest";

import { emptyProduct } from "@/features/extraction/scrapers/types";
import type { ScrapedProduct } from "@/features/extraction/scrapers/types";
import {
  buildGalleryRail,
  buildSpecChips,
  formatCompactCount,
  formatDoorDeliveryLabel,
  formatEtaRange,
  formatProductUrlLabel,
  formatRateLockDeadline,
  formatRatingChip,
  pickProductColour,
} from "../components/format";

function product(overrides: Partial<ScrapedProduct>): ScrapedProduct {
  return { ...emptyProduct(), ...overrides };
}

describe("formatCompactCount", () => {
  it("leaves counts under a thousand whole and grouped", () => {
    expect(formatCompactCount(0)).toBe("0");
    expect(formatCompactCount(964)).toBe("964");
  });

  it("keeps one decimal between 1k and 10k, where it still means something", () => {
    expect(formatCompactCount(1_240)).toBe("1.2k");
    expect(formatCompactCount(9_000)).toBe("9k");
  });

  it("rounds to whole thousands above 10k, as the mock prints '38k'", () => {
    expect(formatCompactCount(28_773)).toBe("29k");
    expect(formatCompactCount(38_000)).toBe("38k");
  });

  it("switches to millions past a million", () => {
    expect(formatCompactCount(1_240_000)).toBe("1.2m");
  });

  it("returns nothing for a number it cannot print", () => {
    expect(formatCompactCount(Number.NaN)).toBe("");
    expect(formatCompactCount(-5)).toBe("");
  });
});

describe("formatRatingChip", () => {
  it("joins the rating and the abbreviated count", () => {
    expect(formatRatingChip(4.7, 28_773)).toBe("4.7 · 29k");
  });

  it("drops the count rather than guessing when the store published none", () => {
    expect(formatRatingChip(4.6, null)).toBe("4.6");
    expect(formatRatingChip(4.6, 0)).toBe("4.6");
  });

  it("renders a whole rating without a trailing zero", () => {
    expect(formatRatingChip(5, 12)).toBe("5 · 12");
  });

  it("has no chip at all without a rating", () => {
    expect(formatRatingChip(null, 28_773)).toBeNull();
  });
});

describe("formatEtaRange", () => {
  // en-GB abbreviates September as "Sept"; the mock's sample reads "Sep". The
  // app's other date helper (`formatEtaDate` on the Home screen) already prints
  // "Sept", and one product showing two spellings of the same month is worse
  // than differing from a mock by a letter.
  it("writes the month once when both ends share it", () => {
    expect(formatEtaRange("2026-09-22", "2026-09-29")).toBe("22 – 29 Sept");
  });

  it("writes both months when the window crosses one", () => {
    expect(formatEtaRange("2026-09-29", "2026-10-03")).toBe("29 Sept – 3 Oct");
  });

  it("collapses a single-day window", () => {
    expect(formatEtaRange("2026-09-22", "2026-09-22")).toBe("22 Sept");
  });

  it("reads the dates as UTC calendar days, not the renderer's zone", () => {
    // 1 Sep would slip to 31 Aug if parsed as local time west of Greenwich.
    expect(formatEtaRange("2026-09-01", "2026-09-01")).toBe("1 Sept");
  });

  it("returns null for junk or a reversed window so the caller falls back", () => {
    expect(formatEtaRange("not-a-date", "2026-09-29")).toBeNull();
    expect(formatEtaRange("2026-09-29", "2026-09-22")).toBeNull();
  });
});

describe("formatRateLockDeadline", () => {
  const now = new Date("2026-09-12T10:00:00Z");

  it("says 'tomorrow' for the next calendar day", () => {
    expect(formatRateLockDeadline("2026-09-13T16:12:00Z", now)).toBe(
      "tomorrow 4:12 PM",
    );
  });

  it("says 'today' for later the same day", () => {
    expect(formatRateLockDeadline("2026-09-12T16:12:00Z", now)).toBe(
      "today 4:12 PM",
    );
  });

  it("names the date further out", () => {
    expect(formatRateLockDeadline("2026-09-16T16:12:00Z", now)).toBe(
      "16 Sept 4:12 PM",
    );
  });

  it("returns null once the lock has lapsed, so the line disappears", () => {
    expect(formatRateLockDeadline("2026-09-12T09:59:00Z", now)).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatRateLockDeadline("soon", now)).toBeNull();
  });
});

describe("buildSpecChips", () => {
  it("emits one chip per fact the extraction actually read, in mock order", () => {
    const chips = buildSpecChips(
      product({
        seller: "6ave",
        brand: "Apple",
        weight: "0.22 kg",
        rating: 4.7,
        review_count: 28_773,
      }),
    );

    expect(chips.map((chip) => chip.key)).toEqual([
      "seller",
      "brand",
      "weight",
      "rating",
    ]);
    expect(chips.map((chip) => chip.value)).toEqual([
      "6ave",
      "Apple",
      "0.22 kg",
      "4.7 · 29k",
    ]);
  });

  it("invents nothing: a null field produces no chip", () => {
    expect(buildSpecChips(emptyProduct())).toEqual([]);
  });

  it("treats a blank string as an unread field", () => {
    expect(buildSpecChips(product({ brand: "   " }))).toEqual([]);
  });
});

describe("pickProductColour", () => {
  it("reads the chosen colour from specifications, whatever the key's case", () => {
    expect(
      pickProductColour(product({ specifications: { Colour: "Black" } })),
    ).toEqual({ selected: "Black", options: [] });
  });

  it("carries the available colours as text and de-duplicates them", () => {
    expect(
      pickProductColour(
        product({
          specifications: { Color: "Black" },
          variants: { color: ["Black", "black", " Silver ", ""] },
        }),
      ),
    ).toEqual({ selected: "Black", options: ["Black", "Silver"] });
  });

  it("returns null when the listing states no colour, so no empty card renders", () => {
    expect(pickProductColour(emptyProduct())).toBeNull();
  });
});

describe("buildGalleryRail", () => {
  const six = ["a", "b", "c", "d", "e", "f"];

  it("shows four thumbs and counts the rest, as the mock's '+2' tile does", () => {
    expect(buildGalleryRail(six, null)).toEqual({
      thumbs: ["a", "b", "c", "d"],
      overflow: 2,
    });
  });

  it("hides the overflow tile when everything fits", () => {
    expect(buildGalleryRail(["a", "b"], null)).toEqual({
      thumbs: ["a", "b"],
      overflow: 0,
    });
  });

  it("falls back to the scalar image for a cache row older than the gallery", () => {
    expect(buildGalleryRail([], "only.jpg")).toEqual({
      thumbs: ["only.jpg"],
      overflow: 0,
    });
  });

  it("is empty when there is no image at all", () => {
    expect(buildGalleryRail([], null)).toEqual({ thumbs: [], overflow: 0 });
  });
});

describe("formatDoorDeliveryLabel", () => {
  it("prefixes a bare zone name with the mode", () => {
    expect(formatDoorDeliveryLabel("Kumasi")).toBe("Door delivery · Kumasi");
  });

  it("leaves a seeded name that already states the mode alone", () => {
    expect(formatDoorDeliveryLabel("Greater Accra · door delivery")).toBe(
      "Greater Accra · door delivery",
    );
  });

  it("falls back to the mode alone for an unnamed zone", () => {
    expect(formatDoorDeliveryLabel("   ")).toBe("Door delivery");
  });
});

describe("formatProductUrlLabel", () => {
  it("drops the scheme and www but keeps the path that identifies the listing", () => {
    expect(
      formatProductUrlLabel(
        "https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH",
      ),
    ).toBe("amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH");
  });

  it("keeps a query string, which can be the whole product identity", () => {
    expect(formatProductUrlLabel("https://shein.com/p?id=42")).toBe(
      "shein.com/p?id=42",
    );
  });

  it("returns an unparseable value unchanged rather than hiding it", () => {
    expect(formatProductUrlLabel("not a url")).toBe("not a url");
  });
});
