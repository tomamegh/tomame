import { describe, expect, it, vi } from "vitest";

vi.mock("@phosphor-icons/react/ssr", () => ({ Check: () => null, CircleNotch: () => null }));

import { readingStageOf, readingSteps } from "../reading-indicator";

describe("reading steps follow the job's status, never a timer", () => {
  it("queued: the store page is being opened", () => {
    expect(readingSteps("amazon.com", "queued").map((s) => s.state)).toEqual(["done", "active", "next", "next"]);
    expect(readingSteps("amazon.com", "queued")[1]!.label).toBe("Opening amazon.com");
  });
  it("running: the page is being read; pricing has not happened yet", () => {
    expect(readingSteps("amazon.com", "reading").map((s) => s.state)).toEqual(["done", "done", "active", "next"]);
  });
});

describe("pricing stage", () => {
  it("the page is read; the landed total is being worked out", () => {
    expect(readingSteps("walmart.com", "pricing").map((s) => s.state)).toEqual(["done", "done", "done", "active"]);
    expect(readingStageOf("ready", true)).toBe("pricing");
    expect(readingStageOf("running", false)).toBe("reading");
    expect(readingStageOf("pending", false)).toBe("queued");
  });
});

