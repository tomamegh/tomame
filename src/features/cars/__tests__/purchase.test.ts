import { describe, expect, it } from "vitest";

import {
  carWhatsappHref,
  carWhatsappMessage,
  depositButtonLabel,
  isPaidInFull,
  purchaseCopy,
  termsSummaryLine,
  type CarPurchaseTermsView,
} from "../components/purchase";

function terms(overrides: Partial<CarPurchaseTermsView> = {}): CarPurchaseTermsView {
  return {
    payablePesewas: 18_000_000,
    depositPesewas: 5_400_000,
    balancePesewas: 12_600_000,
    source: "listing",
    buyable: true,
    ...overrides,
  };
}

describe("depositButtonLabel", () => {
  it("names the sum about to be charged, not the car", () => {
    expect(depositButtonLabel(terms())).toBe("Pay GH₵54,000 deposit");
  });

  it("stops calling it a deposit when the deposit is the whole price", () => {
    expect(
      depositButtonLabel(
        terms({ payablePesewas: 5_400_000, depositPesewas: 5_400_000, balancePesewas: 0 }),
      ),
    ).toBe("Pay GH₵54,000 now");
  });

  it("never says Buy now", () => {
    expect(depositButtonLabel(terms())).not.toMatch(/buy/i);
  });
});

describe("isPaidInFull", () => {
  it("is false while a balance is outstanding", () => {
    expect(isPaidInFull(terms())).toBe(false);
  });

  it("is true at zero, and at a negative balance a rounding could produce", () => {
    expect(isPaidInFull(terms({ balancePesewas: 0 }))).toBe(true);
    expect(isPaidInFull(terms({ balancePesewas: -1 }))).toBe(true);
  });
});

describe("purchaseCopy", () => {
  it("marks a quoted figure as this customer's own", () => {
    const copy = purchaseCopy(terms({ source: "quote" }));
    expect(copy.heading).toBe("The price we quoted you");
    expect(copy.isPrivate).toBe(true);
  });

  it("marks an accepted offer as agreed, not as the asking price", () => {
    const copy = purchaseCopy(terms({ source: "accepted_offer" }));
    expect(copy.heading).toBe("The price we agreed with you");
    expect(copy.isPrivate).toBe(true);
  });

  it("does not claim a listing price is private", () => {
    expect(purchaseCopy(terms()).isPrivate).toBe(false);
  });

  it("says how the balance is settled, and says it is not in the app", () => {
    expect(purchaseCopy(terms()).settlement).toMatch(/bank transfer or in person/);
    expect(purchaseCopy(terms()).settlement).toMatch(/not in the app/);
  });

  it("promises no balance when there is none to settle", () => {
    const copy = purchaseCopy(terms({ balancePesewas: 0 }));
    expect(copy.settlement).toMatch(/in full/);
    expect(copy.settlement).not.toMatch(/bank transfer/);
  });

  it("uses no em dashes anywhere a customer reads", () => {
    for (const source of ["listing", "quote", "accepted_offer"] as const) {
      const copy = purchaseCopy(terms({ source }));
      expect(Object.values(copy).join(" ")).not.toMatch(/—/);
    }
  });
});

describe("termsSummaryLine", () => {
  it("carries all three figures, in the panel's order", () => {
    expect(termsSummaryLine(terms())).toBe(
      "GH₵54,000 now, GH₵126,000 later, GH₵180,000 in all",
    );
  });

  it("collapses to one figure when the deposit is the lot", () => {
    expect(
      termsSummaryLine(
        terms({ payablePesewas: 5_400_000, depositPesewas: 5_400_000, balancePesewas: 0 }),
      ),
    ).toBe("GH₵54,000 in full");
  });
});

describe("carWhatsappHref", () => {
  it("prefills the car and keeps the resolved number untouched", () => {
    const href = carWhatsappHref(
      "https://wa.me/233245550192",
      carWhatsappMessage("2019 Toyota Highlander XLE", "https://tomame.app/app/cars/x"),
    );
    expect(href).toBe(
      "https://wa.me/233245550192?text=" +
        encodeURIComponent(
          "Hi Tomame, I am interested in the 2019 Toyota Highlander XLE. https://tomame.app/app/cars/x",
        ),
    );
  });

  it("is null with no number, so the caller falls back rather than linking to wa.me/", () => {
    expect(carWhatsappHref(null, "anything")).toBeNull();
  });

  it("appends rather than replacing an existing query", () => {
    expect(carWhatsappHref("https://wa.me/233245550192?x=1", "hi")).toBe(
      "https://wa.me/233245550192?x=1&text=hi",
    );
  });
});

describe("carWhatsappMessage", () => {
  it("carries the car's name and its URL, because they serve different readers", () => {
    const message = carWhatsappMessage("2019 Toyota Highlander XLE", "https://t.app/c/x");
    expect(message).toContain("2019 Toyota Highlander XLE");
    expect(message).toContain("https://t.app/c/x");
    expect(message).not.toMatch(/—/);
  });
});
