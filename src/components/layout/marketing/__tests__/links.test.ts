import { describe, expect, it } from "vitest";

import {
  MARKETING_NAV_ITEMS,
  buildFooterColumns,
  buildLegalColumn,
  columnHeadingId,
  formatCopyright,
  formatPaymentChannels,
  formatSupportLine,
  resolveActiveNavKey,
  whatsappHref,
} from "../links";

describe("resolveActiveNavKey", () => {
  it("matches an exact marketing route", () => {
    expect(resolveActiveNavKey("/fees")).toBe("fees");
    expect(resolveActiveNavKey("/where-we-buy")).toBe("regions");
  });

  it("keeps the parent highlighted on a nested route", () => {
    expect(resolveActiveNavKey("/fees/worked-example")).toBe("fees");
  });

  it("returns null for home, unknown routes and a null pathname", () => {
    expect(resolveActiveNavKey("/")).toBeNull();
    expect(resolveActiveNavKey("/app/orders")).toBeNull();
    expect(resolveActiveNavKey(null)).toBeNull();
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(resolveActiveNavKey("/fees-explained")).toBeNull();
  });

  it("honours a caller-supplied item list", () => {
    const items = [{ key: "faq" as const, label: "Help", href: "/help" }];
    expect(resolveActiveNavKey("/help", items)).toBe("faq");
    expect(resolveActiveNavKey("/faq", items)).toBeNull();
  });

  it("exposes the five destinations the design shows", () => {
    expect(MARKETING_NAV_ITEMS.map((item) => item.key)).toEqual([
      "how",
      "regions",
      "fees",
      "faq",
      "about",
    ]);
  });
});

describe("whatsappHref", () => {
  it("strips formatting from a stored number", () => {
    expect(whatsappHref("+233 24 555 0192")).toBe("https://wa.me/233245550192");
  });

  it("returns null when there is nothing dialable", () => {
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("")).toBeNull();
    expect(whatsappHref("call us")).toBeNull();
  });
});

describe("formatSupportLine", () => {
  it("joins the number and hours with a middot", () => {
    expect(formatSupportLine("+233 24 555 0192", "8am–10pm")).toBe(
      "+233 24 555 0192 · 8am–10pm",
    );
  });

  it("falls back to whichever half exists", () => {
    expect(formatSupportLine("+233 24 555 0192", null)).toBe(
      "+233 24 555 0192",
    );
    expect(formatSupportLine(null, "8am–10pm")).toBe("8am–10pm");
    expect(formatSupportLine(null, null)).toBeNull();
    expect(formatSupportLine("  ", "")).toBeNull();
  });
});

describe("formatPaymentChannels", () => {
  it("joins the seeded channels in order", () => {
    expect(
      formatPaymentChannels([
        "MTN MoMo",
        "Telecel Cash",
        "AT Money",
        "Visa",
        "Mastercard",
      ]),
    ).toBe("MTN MoMo · Telecel Cash · AT Money · Visa · Mastercard");
  });

  it("drops blank entries and returns null when nothing is left", () => {
    expect(formatPaymentChannels(["MTN MoMo", " ", "Visa"])).toBe(
      "MTN MoMo · Visa",
    );
    expect(formatPaymentChannels([])).toBeNull();
  });
});

describe("formatCopyright", () => {
  it("uses the supplied year and the stored address", () => {
    expect(formatCopyright(2026, "Accra, Ghana")).toBe(
      "© 2026 Tomame. Accra, Ghana.",
    );
  });

  it("omits the address when it is missing", () => {
    expect(formatCopyright(2027, null)).toBe("© 2027 Tomame.");
    expect(formatCopyright(2027, "   ")).toBe("© 2027 Tomame.");
  });
});

describe("buildFooterColumns", () => {
  it("adds a WhatsApp link built from the stored number", () => {
    const help = buildFooterColumns("+233 24 555 0192").find(
      (column) => column.heading === "Help",
    );
    expect(help?.links.at(-1)).toEqual({
      label: "WhatsApp",
      href: "https://wa.me/233245550192",
      external: true,
    });
  });

  it("omits WhatsApp entirely when no number is configured", () => {
    const help = buildFooterColumns(null).find(
      (column) => column.heading === "Help",
    );
    expect(help?.links.some((link) => link.label === "WhatsApp")).toBe(false);
  });

  it("returns Shop, Help and Company — Legal comes from policies", () => {
    expect(buildFooterColumns(null).map((column) => column.heading)).toEqual([
      "Shop",
      "Help",
      "Company",
    ]);
  });
});

describe("buildLegalColumn", () => {
  it("orders known slugs canonically and links to the policies page", () => {
    const column = buildLegalColumn([
      { slug: "payment", label: "Payment policy" },
      { slug: "privacy", label: "Privacy" },
      { slug: "returns", label: "Returns & refunds" },
      { slug: "terms", label: "Terms" },
      { slug: "shipping", label: "Shipping policy" },
    ]);

    expect(column.links).toEqual([
      { label: "Privacy", href: "/policies#privacy" },
      { label: "Terms", href: "/policies#terms" },
      { label: "Shipping policy", href: "/policies#shipping" },
      { label: "Returns & refunds", href: "/policies#returns" },
      { label: "Payment policy", href: "/policies#payment" },
    ]);
  });

  it("appends unknown slugs alphabetically after the known ones", () => {
    const column = buildLegalColumn([
      { slug: "cookies", label: "Cookies" },
      { slug: "acceptable-use", label: "Acceptable use" },
      { slug: "terms", label: "Terms" },
    ]);

    expect(column.links.map((link) => link.label)).toEqual([
      "Terms",
      "Acceptable use",
      "Cookies",
    ]);
  });

  it("is empty when no policies are published", () => {
    expect(buildLegalColumn([]).links).toEqual([]);
  });
});

describe("columnHeadingId", () => {
  it("slugifies a heading into a stable id", () => {
    expect(columnHeadingId("Shop")).toBe("footer-shop");
    expect(columnHeadingId("Returns & refunds")).toBe("footer-returns-refunds");
  });
});
