import { describe, expect, it } from "vitest";

import {
  buyerHandoffText,
  compareSummary,
  finderReference,
  FinderNarrator,
  freightSummary,
  listNames,
  nothingFoundMessage,
  priceSummary,
  searchDetails,
  searchStartedLabel,
  searchSummary,
  shortlistSummary,
} from "../narration";
import { reduceFinderEvents } from "../state/reducer";

describe("FinderNarrator", () => {
  it("stamps each event with the time since the run started, and appends in order", () => {
    let now = 1_000;
    const n = new FinderNarrator(1_000, () => now, [{ type: "run_started", at: 0, query: "PS5", budgetGhs: null }]);
    now = 1_300;
    n.emit({ type: "step_started", step: "understand", label: "Reading your request" });
    now = 3_700;
    n.emit({ type: "step_done", step: "understand", summary: "PS5 Slim, new" });
    expect(n.events.map((e) => [e.type, e.at])).toEqual([
      ["run_started", 0],
      ["step_started", 300],
      ["step_done", 2_700],
    ]);
    // The screen's reducer reads it as is.
    expect(reduceFinderEvents(n.events).steps[0]).toMatchObject({ status: "done", label: "PS5 Slim, new" });
  });
});

describe("search narration", () => {
  it("names the stores actually searched and the listings they returned", () => {
    expect(listNames(["Amazon", "eBay", "Walmart"])).toBe("Amazon, eBay and Walmart");
    expect(searchStartedLabel(["Amazon", "eBay"])).toBe("Searching Amazon and eBay");
    expect(searchStartedLabel([])).toBe("Searching what we have already priced");
    expect(
      searchSummary(
        [
          { name: "Amazon", listings: 9, failed: false },
          { name: "eBay", listings: 5, failed: false },
          { name: "Walmart", listings: 0, failed: true },
        ],
        0,
      ),
    ).toBe("Searched Amazon and eBay · 14 listings");
    expect(searchSummary([], 3)).toBe("Searched what we have already priced · 3 listings");
  });

  it("says which stores were skipped and why", () => {
    expect(
      searchDetails(4, [
        { name: "Walmart", reason: "budget" },
        { name: "Etsy", reason: "no_key" },
        { name: "eBay", reason: "failed" },
      ]),
    ).toEqual([
      "4 listings we had already priced",
      "Walmart not searched: this month's search allowance is used up",
      "Etsy not searched: store search is not set up",
      "eBay did not answer in time",
    ]);
  });
});

describe("step summaries", () => {
  it("shortlist", () => {
    expect(shortlistSummary(3, 14)).toBe("3 of 14 are the exact item");
    expect(shortlistSummary(1, 14)).toBe("1 of 14 is the exact item");
    expect(shortlistSummary(0, 14)).toBe("None of the 14 listings is the exact item");
  });

  it("price", () => {
    expect(priceSummary(3, 3, 0)).toBe("All 3 prices confirmed at the store.");
    expect(priceSummary(2, 3, 0)).toBe("2 of 3 prices confirmed. Still confirming one with the store.");
    expect(priceSummary(1, 3, 2)).toBe("The price is confirmed at the store. 2 pages could not be read.");
    expect(priceSummary(0, 2, 2)).toBe("We could not read the price on any of the 2 store pages.");
  });

  it("freight and compare", () => {
    expect(freightSummary([285, 285])).toBe("Freight to Accra is GH₵285.00, customs and clearance included");
    expect(freightSummary([285, 410.5])).toBe("Freight to Accra is GH₵285.00 to GH₵410.50, customs and clearance included");
    expect(compareSummary(3, null)).toBe("Ranked by landed total.");
    expect(compareSummary(3, 2)).toBe("Ranked by landed total. 2 of 3 fit your budget.");
    expect(compareSummary(2, 2)).toBe("Ranked by landed total. All fit your budget.");
  });
});

describe("no match and the buyer hand-off", () => {
  it("names the stores searched", () => {
    expect(nothingFoundMessage("PS5 Slim Digital", ["Amazon", "eBay"], "no_exact")).toBe(
      "We searched Amazon and eBay and what we have already priced and found no new PS5 Slim Digital we can buy and ship for you.",
    );
  });

  it("types the request and a reference into the WhatsApp message", () => {
    const id = "1a2b3c4d-0000-4000-8000-000000000000";
    expect(finderReference(id)).toBe("F-1A2B3C4D");
    expect(buyerHandoffText("PS5 slim digital", 9000, id)).toBe("Hi Tomame, please help me find this: PS5 slim digital (new, up to GH₵9,000). Ref F-1A2B3C4D");
  });
});
