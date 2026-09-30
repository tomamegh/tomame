import { describe, expect, it } from "vitest";

import type { RegionRow } from "@/db/queries/regions";
import type { SiteContentRow } from "@/db/queries/site-content";
import {
  contentTokenValues,
  fillContentTokens,
  fillRowTokens,
  fillRowsTokens,
  shippingMethodsMarkdown,
} from "../content-tokens";

function region(overrides: Partial<RegionRow> = {}): RegionRow {
  return {
    code: "USA", name: "United States", status: "live", hub_city: "New York",
    transit_days_min: 5, transit_days_max: 7, store_names: [], tag_names: [],
    blurb: null, photo_key: null, sort_order: 1, departure_weekday: 5, departure_cutoff_hours: 24, ...overrides,
  };
}

function row(overrides: Partial<SiteContentRow> = {}): SiteContentRow {
  return {
    id: "r1", kind: "faq", slug: "how-long", locale: "en", title: null, body: null,
    data: {}, sort_order: 1, ...overrides,
  };
}

const values = { delivery_window: "5–7 days", pickup_point: "our Weija hub" };

describe("contentTokenValues", () => {
  it("reads the first live region's transit days", () => {
    const regions = [region({ code: "UK", status: "soon", transit_days_min: 3, transit_days_max: 4 }), region()];
    expect(contentTokenValues(regions, { pickup_point: " our Weija hub " })).toEqual({
      delivery_window: "5–7 days",
      pickup_point: "our Weija hub",
    });
    expect(contentTokenValues(regions).pickup_point).toBeNull();
  });

  it("collapses an equal window and leaves an unset one null", () => {
    expect(contentTokenValues([region({ transit_days_min: 6, transit_days_max: 6 })]).delivery_window).toBe("6 days");
    expect(contentTokenValues([region({ transit_days_min: null, transit_days_max: null })]).delivery_window).toBeNull();
    expect(contentTokenValues([]).delivery_window).toBeNull();
  });
});

describe("fillContentTokens", () => {
  it("fills every occurrence and leaves other braces alone", () => {
    expect(fillContentTokens("{delivery_window}, typically {delivery_window} {x}", values)).toBe(
      "5–7 days, typically 5–7 days {x}",
    );
    expect(fillContentTokens("Collect it at {pickup_point}.", values)).toBe("Collect it at our Weija hub.");
  });

  it("returns null when a token has no value", () => {
    expect(fillContentTokens("Typically {delivery_window}.", { delivery_window: null, pickup_point: null })).toBeNull();
    expect(fillContentTokens("No token here.", { delivery_window: null, pickup_point: null })).toBe("No token here.");
  });
});

describe("fillRowTokens", () => {
  it("fills the title, body and string data cells", () => {
    const filled = fillRowTokens(
      row({ title: "{delivery_window} to your door", body: "Typically {delivery_window}.", data: { tomame: "{delivery_window}", n: 4 } }),
      values,
    );
    expect(filled).toMatchObject({
      title: "5–7 days to your door",
      body: "Typically 5–7 days.",
      data: { tomame: "5–7 days", n: 4 },
    });
  });

  it("drops a row it cannot fill rather than printing a hole", () => {
    const rows = [row({ title: "{delivery_window}" }), row({ id: "r2", title: "Quote without an account" })];
    expect(fillRowsTokens(rows, { delivery_window: null, pickup_point: null }).map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("shippingMethodsMarkdown", () => {
  it("prints one bullet per method, window then note", () => {
    const rows = [
      row({ kind: "shipping_method", title: "Air freight", body: "Every order flies this way.", data: { window: "5–7 days from payment" } }),
      row({ kind: "shipping_method", title: "Sea freight", body: "On request.", data: { window: "" } }),
    ];
    expect(shippingMethodsMarkdown(rows)).toBe(
      "- **Air freight**: 5–7 days from payment. Every order flies this way.\n- **Sea freight**: On request.",
    );
  });

  it("is empty with no methods", () => {
    expect(shippingMethodsMarkdown([])).toBe("");
  });
});
