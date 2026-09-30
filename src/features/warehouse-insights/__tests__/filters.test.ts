import { describe, expect, it } from "vitest";

import {
  dayBounds,
  decodeCursor,
  encodeCursor,
  insightsHref,
  kindGroup,
  normaliseReference,
  parseRange,
  parseTimelineFilters,
} from "../filters";

const ID = "0cc86b58-ba66-4922-875e-8066bfdb0ada";

describe("parseRange", () => {
  it("accepts 7, 30 and 90 and defaults everything else to 7", () => {
    expect(parseRange("30")).toBe(30);
    expect(parseRange(["90", "7"])).toBe(90);
    expect(parseRange("14")).toBe(7);
    expect(parseRange(undefined)).toBe(7);
  });
});

describe("normaliseReference", () => {
  it("forgives case, spaces and a missing dash", () => {
    expect(normaliseReference("pkg 10001")).toBe("PKG-10001");
    expect(normaliseReference("PKG10001")).toBe("PKG-10001");
    expect(normaliseReference("tm-5")).toBe("TM-00005");
    expect(normaliseReference("TM-00005")).toBe("TM-00005");
  });

  it("drops anything that is not one of the two printed shapes", () => {
    expect(normaliseReference("hello")).toBeNull();
    expect(normaliseReference("PKG-1")).toBeNull();
    expect(normaliseReference("")).toBeNull();
  });
});

describe("cursor", () => {
  it("round-trips", () => {
    const c = { at: "2026-09-30T18:48:25.032Z", id: ID };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("keeps a Postgres stamp's microseconds", () => {
    expect(decodeCursor(`2026-09-30T18:59:39.920813+00:00~${ID}`)).toEqual({ at: "2026-09-30T18:59:39.920813+00:00", id: ID });
  });

  it("rejects junk", () => {
    expect(decodeCursor("nope")).toBeNull();
    expect(decodeCursor(`2026-09-30T00:00:00Z~not-a-uuid`)).toBeNull();
    expect(decodeCursor(`garbage~${ID}`)).toBeNull();
    expect(decodeCursor(`2026-09-30T00:00:00Z~${ID}~extra`)).toBeNull();
  });
});

describe("parseTimelineFilters", () => {
  it("keeps what parses and drops what does not", () => {
    const f = parseTimelineFilters({
      actor: ID.toUpperCase(),
      kind: "shipped",
      from: "2026-09-01",
      to: "2026-02-31",
      q: "pkg 10001",
    });
    expect(f.actor).toBe(ID);
    expect(f.kind.value).toBe("shipped");
    expect(f.from).toBe("2026-09-01");
    expect(f.to).toBeNull();
    expect(f.q).toBe("PKG-10001");
    expect(f.qRaw).toBe("pkg 10001");
    expect(f.before).toBeNull();
  });

  it("defaults to all work without page views, and swaps a backwards range", () => {
    const f = parseTimelineFilters({ actor: "robert'); drop table", kind: "bogus", from: "2026-09-30", to: "2026-09-01" });
    expect(f.actor).toBeNull();
    expect(f.kind.value).toBe("work");
    expect(f.kind.kinds).not.toContain("page_view");
    expect([f.from, f.to]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("maps kind groups onto the two tables", () => {
    expect(kindGroup("pages")).toMatchObject({ actions: [], kinds: ["page_view"] });
    expect(kindGroup("all")).toMatchObject({ actions: null, kinds: null });
    expect(kindGroup("received").kinds).toEqual([]);
  });
});

describe("dayBounds", () => {
  it("makes `to` inclusive", () => {
    expect(dayBounds({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(dayBounds({ from: null, to: null })).toEqual({ since: null, until: null });
  });
});

describe("insightsHref", () => {
  it("changes one parameter and drops the cursor", () => {
    expect(insightsHref({ range: "30", kind: "labels", before: "x" }, { actor: ID })).toBe(
      `/admin/warehouse?range=30&kind=labels&actor=${ID}`,
    );
  });

  it("keeps the other filters when paging, and removes a null", () => {
    expect(insightsHref({ range: "30", kind: "labels" }, { before: "c", kind: null })).toBe(
      "/admin/warehouse?range=30&before=c",
    );
    expect(insightsHref({}, {})).toBe("/admin/warehouse");
  });
});
