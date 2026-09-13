import { describe, expect, it } from "vitest";

import {
  contactActionsFor,
  contactReplyHref,
  contactStatusLabel,
  contactStatusTone,
  describeContactWait,
} from "../components/queue-format";

const NOW = new Date("2026-09-13T12:00:00Z");

const MESSAGE = {
  email: "ama@example.com",
  name: "Ama Owusu",
  subject: "Shipping to Kumasi",
  message: "Do you deliver to Kumasi?\nAnd how long does it take?",
};

describe("contactReplyHref", () => {
  it("threads the subject", () => {
    const href = contactReplyHref(MESSAGE) ?? "";
    expect(decodeURIComponent(href)).toContain("subject=Re: Shipping to Kumasi");
  });

  it("does not thread a subject that is already threaded", () => {
    const href = contactReplyHref({ ...MESSAGE, subject: "RE: Shipping" }) ?? "";
    expect(decodeURIComponent(href)).not.toContain("Re: RE:");
  });

  it("quotes the original underneath, so the reply carries its own context", () => {
    const body = decodeURIComponent(contactReplyHref(MESSAGE) ?? "");
    expect(body).toContain("> Do you deliver to Kumasi?");
    expect(body).toContain("> And how long does it take?");
  });

  it("greets them by first name", () => {
    expect(decodeURIComponent(contactReplyHref(MESSAGE) ?? "")).toContain("Hello Ama,");
  });

  it("falls back to a greeting rather than an empty name", () => {
    const body = decodeURIComponent(contactReplyHref({ ...MESSAGE, name: "   " }) ?? "");
    expect(body).toContain("Hello there,");
  });

  it("encodes an ampersand rather than truncating the draft at it", () => {
    const href = contactReplyHref({ ...MESSAGE, subject: "Fees & freight" }) ?? "";
    expect(href).toContain("Fees%20%26%20freight");
  });

  it("returns nothing when there is no address to reply to", () => {
    expect(contactReplyHref({ ...MESSAGE, email: "not-an-address" })).toBeNull();
  });
});

describe("describeContactWait", () => {
  it("says how long the sender has been waiting", () => {
    expect(describeContactWait("2026-09-13T10:00:00Z", NOW)).toBe("Waiting 2 hrs");
  });

  it("drops the clause rather than printing an invalid date", () => {
    expect(describeContactWait("nonsense", NOW)).toBeNull();
  });
});

describe("contactActionsFor", () => {
  it("offers reply-or-close while it is open, and only close after", () => {
    expect(contactActionsFor("open")).toEqual(["answered", "closed"]);
    expect(contactActionsFor("answered")).toEqual(["closed"]);
    expect(contactActionsFor("closed")).toEqual([]);
  });
});

describe("contactStatusLabel / contactStatusTone", () => {
  it("spends amber only on the message nobody has answered", () => {
    expect(contactStatusTone("open")).toBe("amber");
    expect(contactStatusTone("answered")).toBe("green");
    expect(contactStatusTone("closed")).toBe("muted");
  });

  it("says unanswered rather than open, which reads as a ticket id", () => {
    expect(contactStatusLabel("open")).toBe("Unanswered");
  });
});
