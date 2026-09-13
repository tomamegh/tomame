import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatPaymentChannel, formatPaymentDate, pesewasToGhs } from "../format";

/**
 * The Payment tab must never imply that Tomame holds a saved card.
 *
 * Paystack tokenisation is not implemented and no `payment_methods` table
 * exists, so anything on this screen that reads as a stored instrument would be
 * a lie about what we hold on a customer — the one class of mistake on this
 * screen that has a real consequence.
 *
 * These are SOURCE-LEVEL assertions, and deliberately so: this repository has
 * no DOM test environment (no jsdom, no testing-library — `vitest.config.ts`
 * sets only `globals`), so there is no way to render the panel and read its
 * output. Reading the file is the precedent already used by
 * `src/lib/__tests__/env-provisioning.test.ts`, which asserts against
 * `infra/main.tf` the same way. What this cannot prove is how the rendered page
 * looks; what it can prove is that the copy and the data shape stay honest.
 */

const ROOT = path.resolve(__dirname, "../../..");
const PANEL = path.join(ROOT, "features/account/components/account-payment-panel.tsx");
const panelSource = readFileSync(PANEL, "utf8");

/**
 * Comments are stripped before the phrase scan. This file's own explanation of
 * what the panel must not claim contains the very phrases it forbids, and so
 * does the panel's header comment — scanning them would make the test
 * unwritable. What reaches a customer is the JSX and its string literals.
 */
const panelRendered = panelSource
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

/**
 * Phrases that only make sense if something is stored. Each is the natural way
 * a future edit would introduce the claim.
 */
const FORBIDDEN = [
  "saved card",
  "saved cards",
  "saved payment method",
  "payment method on file",
  "card on file",
  "default card",
  "manage cards",
  "remove card",
  "add a card",
  "expires",
  "•••",
  "ending in",
  "last4",
  "last_4",
];

describe("the Payment tab claims no stored instrument", () => {
  it.each(FORBIDDEN)("never says %s", (phrase) => {
    expect(panelRendered.toLowerCase()).not.toContain(phrase.toLowerCase());
  });

  it("says outright that no card details are stored", () => {
    expect(panelSource).toContain("Tomame stores no card or Mobile Money details");
    expect(panelSource.toLowerCase()).toContain("nothing saved to manage here");
  });

  it("points at the payment policy, which says the same thing", () => {
    expect(panelSource).toContain("/policies#payment");
  });

  it("renders only fields a transaction record actually has", () => {
    // `PaymentResponse` (src/features/payments/types) is id, reference, amount,
    // currency, status, channel, createdAt — a record of a payment that
    // happened. There is no token, no authorisation code, no masked PAN to
    // render even by accident, and this test fails if one appears.
    const paymentTypes = readFileSync(path.join(ROOT, "features/payments/types/index.ts"), "utf8");
    const response = paymentTypes.slice(
      paymentTypes.indexOf("export interface PaymentResponse"),
      paymentTypes.indexOf("export interface InitializePaymentResponse"),
    );
    for (const field of ["authorization", "auth_code", "token", "last4", "bin", "exp_month"]) {
      expect(response.toLowerCase()).not.toContain(field);
    }
  });

  it("has no payment_methods table behind it — the data map put saved cards out of scope", () => {
    // If a migration ever adds one, this test is the prompt to revisit the copy
    // above rather than leaving it quietly wrong.
    const source = readFileSync(
      path.join(ROOT, "features/account/components/account-payment-panel.tsx"),
      "utf8",
    );
    expect(source).not.toContain("payment_methods");
  });
});

describe("payment figures", () => {
  it("converts pesewas to cedis, and only here", () => {
    expect(pesewasToGhs(129_900)).toBe(1299);
    expect(pesewasToGhs(50)).toBe(0.5);
    expect(pesewasToGhs(0)).toBe(0);
  });

  it("does not render NaN for a nonsense amount", () => {
    expect(pesewasToGhs(Number.NaN)).toBe(0);
  });

  it("shows a channel as words without inventing a name for an unknown one", () => {
    expect(formatPaymentChannel("mobile_money")).toBe("Mobile money");
    expect(formatPaymentChannel("card")).toBe("Card");
    // Paystack can add a channel tomorrow; a customer who paid by it sees it.
    expect(formatPaymentChannel("bank_transfer")).toBe("Bank transfer");
    expect(formatPaymentChannel("")).toBe("");
  });

  it("falls back to the raw timestamp rather than printing Invalid Date", () => {
    // "Sep" or "Sept" depending on the ICU data Node ships; the point is that a
    // real date renders as a readable one, not which abbreviation wins.
    expect(formatPaymentDate("2026-09-13T10:00:00Z")).toMatch(/^13 Sept? 2026$/);
    expect(formatPaymentDate("not a date")).toBe("not a date");
  });
});
