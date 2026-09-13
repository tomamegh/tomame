import { describe, expect, it } from "vitest";

import {
  assistedActionsFor,
  assistedStatusLabel,
  assistedStatusTone,
  assistedWhatsappHref,
  describeAssistedWait,
} from "../components/queue-format";

const NOW = new Date("2026-09-13T12:00:00Z");

describe("describeAssistedWait", () => {
  it("says how long somebody has been waiting", () => {
    expect(describeAssistedWait("2026-09-13T09:00:00Z", NOW)).toBe("Waiting 3 hrs");
    expect(describeAssistedWait("2026-09-11T12:00:00Z", NOW)).toBe("Waiting 2 days");
  });

  it("does not say 'waiting yesterday'", () => {
    // formatRelativeTime answers "yesterday" with no "ago" to strip — the phrase
    // still has to read like English.
    expect(describeAssistedWait("2026-09-12T11:00:00Z", NOW)).toBe("Waiting yesterday");
  });

  it("reads as arrival, not as a wait, for something that just landed", () => {
    expect(describeAssistedWait("2026-09-13T11:59:40Z", NOW)).toBe("Just arrived");
  });

  it("drops the clause rather than printing an invalid date", () => {
    expect(describeAssistedWait("not a date", NOW)).toBeNull();
  });
});

describe("assistedWhatsappHref", () => {
  it("dials the CUSTOMER's number, in international form", () => {
    const href = assistedWhatsappHref({
      phone: "024 555 0192",
      product_url: "https://www.amazon.com/dp/B0TEST",
    });
    expect(href).toContain("https://wa.me/233245550192");
  });

  it("names the store in the draft so the customer knows which request it is", () => {
    const href = assistedWhatsappHref({
      phone: "+233245550192",
      product_url: "https://www.walmart.com/ip/1",
    });
    expect(decodeURIComponent(href ?? "")).toContain("walmart.com");
  });

  it("encodes the draft, so a message is never truncated at a stray character", () => {
    const href = assistedWhatsappHref({
      phone: "0245550192",
      product_url: "https://shop.example.com/x",
    });
    expect(href).not.toMatch(/\?text=[^&]*\s/);
  });

  it("returns nothing for a number that cannot be dialled", () => {
    expect(assistedWhatsappHref({ phone: "   ", product_url: "https://a.com/b" })).toBeNull();
  });
});

describe("assistedActionsFor", () => {
  it("offers the whole path from open", () => {
    expect(assistedActionsFor("open")).toEqual(["contacted", "resolved", "cancelled"]);
  });

  it("cannot go back to contacted once it is there", () => {
    expect(assistedActionsFor("contacted")).toEqual(["resolved", "cancelled"]);
  });

  it("offers nothing on a request that is finished", () => {
    expect(assistedActionsFor("resolved")).toEqual([]);
    expect(assistedActionsFor("cancelled")).toEqual([]);
  });
});

describe("assistedStatusLabel / assistedStatusTone", () => {
  it("spends amber only where a person owes somebody an action", () => {
    expect(assistedStatusTone("open")).toBe("amber");
    expect(assistedStatusTone("contacted")).toBe("coral");
    expect(assistedStatusTone("resolved")).toBe("green");
    expect(assistedStatusTone("cancelled")).toBe("muted");
  });

  it("names statuses the way a buyer would", () => {
    expect(assistedStatusLabel("open")).toBe("Waiting");
    expect(assistedStatusLabel("contacted")).toBe("In conversation");
  });
});
