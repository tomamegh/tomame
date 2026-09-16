import { describe, expect, it } from "vitest";

import {
  checkBalanceAmount,
  describeBalanceGap,
  readCarOrderMoney,
  readCarOrderStatus,
  readPriceOrigin,
  type CarSaleFigures,
} from "../car-order-money";

/**
 * The car sales screen's arithmetic (migrations 068, 069).
 *
 * WHAT IS WORTH A TEST HERE is what an admin would act on and could not check:
 * that a sale reports what has actually been received rather than what was
 * agreed, that a typed balance is held to the exact outstanding figure the way
 * `recordCarBalancePayment` holds it, and that a price agreed in a conversation
 * is never reported as the listing price. The rest of the screen is layout.
 */

const PRICE = 18_500_000; // GH₵185,000
const DEPOSIT = 5_550_000; // 30%
const BALANCE = PRICE - DEPOSIT;

function figures(overrides: Partial<CarSaleFigures> = {}): CarSaleFigures {
  return {
    status: "deposit_paid",
    pricePesewas: PRICE,
    depositPesewas: DEPOSIT,
    depositPercent: 30,
    balancePesewas: BALANCE,
    balanceAmountPesewas: null,
    depositPaidAt: "2026-09-12T10:00:00Z",
    ...overrides,
  };
}

describe("readCarOrderMoney", () => {
  it("counts only the deposit while the balance is still owed", () => {
    const money = readCarOrderMoney(figures());
    expect(money.receivedPesewas).toBe(DEPOSIT);
    expect(money.outstandingPesewas).toBe(BALANCE);
    expect(money.awaitingBalance).toBe(true);
    expect(money.fullyPaid).toBe(false);
  });

  it("counts nothing before the deposit settles", () => {
    const money = readCarOrderMoney(
      figures({ status: "pending_payment", depositPaidAt: null }),
    );
    expect(money.receivedPesewas).toBe(0);
    expect(money.outstandingPesewas).toBe(PRICE);
    expect(money.depositSettled).toBe(false);
  });

  it("counts the whole price once the sale is paid", () => {
    const money = readCarOrderMoney(
      figures({ status: "paid", balanceAmountPesewas: BALANCE }),
    );
    expect(money.receivedPesewas).toBe(PRICE);
    expect(money.outstandingPesewas).toBe(0);
    expect(money.awaitingBalance).toBe(false);
  });

  it("treats every state past paid as fully paid", () => {
    for (const status of ["processing", "in_transit", "delivered"]) {
      const money = readCarOrderMoney(figures({ status }));
      expect(money.fullyPaid).toBe(true);
      expect(money.outstandingPesewas).toBe(0);
    }
  });

  it("reports a 100% deposit that settled straight to paid as fully received", () => {
    // 069 routes a full deposit past `deposit_paid` entirely, so the row can be
    // `paid` with no `deposit_paid_at` on it. Reading the timestamp alone would
    // report a car that is bought and gone as having had nothing paid on it.
    const money = readCarOrderMoney(
      figures({
        status: "paid",
        depositPesewas: PRICE,
        depositPercent: 100,
        balancePesewas: 0,
        depositPaidAt: null,
      }),
    );
    expect(money.receivedPesewas).toBe(PRICE);
    expect(money.depositSettled).toBe(true);
  });

  it("keeps the figures on an unwound sale, because unwinding refunds nothing", () => {
    const money = readCarOrderMoney(figures({ status: "cancelled" }));
    expect(money.receivedPesewas).toBe(DEPOSIT);
    expect(money.fullyPaid).toBe(false);
  });
});

describe("readPriceOrigin", () => {
  it("names an accepted offer and says what the listing asks today", () => {
    const reading = readPriceOrigin({
      source: "accepted_offer",
      pricePesewas: 18_400_000,
      listingPricePesewas: PRICE,
    });
    expect(reading.label).toBe("An offer we accepted");
    expect(reading.note).toContain("185,000");
  });

  it("says nothing extra when the listing price is what was charged", () => {
    const reading = readPriceOrigin({
      source: "listing",
      pricePesewas: PRICE,
      listingPricePesewas: PRICE,
    });
    expect(reading.source).toBe("listing");
    expect(reading.note).toBeNull();
  });

  it("explains a quote on a car that carries no public price", () => {
    const reading = readPriceOrigin({
      source: "quote",
      pricePesewas: PRICE,
      listingPricePesewas: null,
    });
    expect(reading.label).toBe("A price we quoted");
    expect(reading.note).toContain("no public price");
  });

  it("does not guess at an unrecognised source", () => {
    const reading = readPriceOrigin({
      source: "something_new",
      pricePesewas: PRICE,
      listingPricePesewas: PRICE,
    });
    expect(reading.source).toBe("unknown");
    expect(reading.label).toBe("Source not recorded");
  });
});

describe("readCarOrderStatus", () => {
  it("is the only state that says a person owes an action", () => {
    expect(readCarOrderStatus("deposit_paid").needsAction).toBe(true);
    for (const status of ["pending_payment", "paid", "processing", "in_transit", "delivered", "cancelled"]) {
      expect(readCarOrderStatus(status).needsAction).toBe(false);
    }
  });

  it("says both halves of what deposit_paid means", () => {
    const blurb = readCarOrderStatus("deposit_paid").blurb;
    expect(blurb).toContain("paid us");
    expect(blurb).toContain("does not yet own the car outright");
  });

  it("renders an unknown status as itself rather than as a blank", () => {
    expect(readCarOrderStatus("something_new").label).toBe("something_new");
  });
});

describe("checkBalanceAmount", () => {
  it("accepts the exact outstanding figure", () => {
    const check = checkBalanceAmount("129500", BALANCE);
    expect(check.ok).toBe(true);
    expect(check.ok && check.pesewas).toBe(BALANCE);
  });

  it("accepts thousands separators and a pasted currency symbol", () => {
    const check = checkBalanceAmount("GH₵129,500", BALANCE);
    expect(check.ok && check.pesewas).toBe(BALANCE);
  });

  it("converts cedis without a coin going astray", () => {
    // The pesewa matters: `recordCarBalancePayment` compares the amount to the
    // outstanding figure exactly, so one coin adrift is a refused write.
    const check = checkBalanceAmount("129500.55", 12_950_055);
    expect(check.ok && check.pesewas).toBe(12_950_055);
  });

  it("refuses a blank field, which parseCedis alone treats as legal", () => {
    expect(checkBalanceAmount("   ", BALANCE).ok).toBe(false);
  });

  it("refuses zero", () => {
    expect(checkBalanceAmount("0", BALANCE).ok).toBe(false);
  });

  it("refuses a part payment and names both figures", () => {
    const check = checkBalanceAmount("100000", BALANCE);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.problem).toContain("129,500");
    expect(!check.ok && check.problem).toContain("100,000");
  });

  it("refuses an overpayment too", () => {
    const check = checkBalanceAmount("130000", BALANCE);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.problem).toContain("more than");
  });
});

describe("describeBalanceGap", () => {
  it("names the shortfall and both figures", () => {
    const sentence = describeBalanceGap(12_700_000, BALANCE);
    expect(sentence).toContain("less than");
    expect(sentence).toContain("2,500");
  });

  it("names the excess", () => {
    expect(describeBalanceGap(13_200_000, BALANCE)).toContain("more than");
  });
});
