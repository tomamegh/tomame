import { describe, expect, it } from "vitest";

import {
  amountsAgree,
  channelLabel,
  customerName,
  describeVerification,
  formatDateTime,
  formatPesewas,
  transactionStatusLabel,
  summariseTransactions,
  transactionTone,
} from "../components/admin-money-format";

describe("formatPesewas", () => {
  it("crosses the pesewas boundary exactly once", () => {
    expect(formatPesewas(125_000)).toBe("GH₵1,250.00");
  });

  it("keeps the sub-cedi part", () => {
    expect(formatPesewas(504_116)).toBe("GH₵5,041.16");
  });

  it("formats a zero charge rather than hiding it", () => {
    expect(formatPesewas(0)).toBe("GH₵0.00");
  });
});

describe("transactionTone", () => {
  it("treats an unsettled charge as waiting on a human, not as an error", () => {
    expect(transactionTone("pending")).toBe("amber");
  });

  it("greens a settled charge and mutes a failed one", () => {
    expect(transactionTone("success")).toBe("green");
    expect(transactionTone("failed")).toBe("muted");
  });
});

describe("transactionStatusLabel", () => {
  it("says what the state means rather than echoing the column", () => {
    expect(transactionStatusLabel("success")).toBe("Paid");
    expect(transactionStatusLabel("pending")).toBe("Unsettled");
    expect(transactionStatusLabel("failed")).toBe("Failed");
  });

  it("prints an unrecognised status verbatim rather than nothing", () => {
    expect(transactionStatusLabel("abandoned")).toBe("abandoned");
  });
});

describe("channelLabel", () => {
  it("humanises Paystack's slug", () => {
    expect(channelLabel("mobile_money")).toBe("Mobile money");
    expect(channelLabel("card")).toBe("Card");
  });

  it("returns null when no channel has been recorded, so the screen can say so", () => {
    expect(channelLabel(null)).toBeNull();
    expect(channelLabel("")).toBeNull();
    expect(channelLabel("   ")).toBeNull();
  });
});

describe("customerName", () => {
  const base = { id: "u1", first_name: null, last_name: null, email: null };

  it("joins the names it has", () => {
    expect(customerName({ ...base, first_name: "Ama", last_name: "Mensah" })).toBe("Ama Mensah");
    expect(customerName({ ...base, first_name: "Ama" })).toBe("Ama");
  });

  it("falls back to the email and then to null — never to a placeholder", () => {
    expect(customerName({ ...base, email: "ama@example.com" })).toBe("ama@example.com");
    expect(customerName(base)).toBeNull();
    expect(customerName(null)).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("returns null for junk instead of 'Invalid Date'", () => {
    expect(formatDateTime("not a date")).toBeNull();
    expect(formatDateTime(null)).toBeNull();
    expect(formatDateTime(undefined)).toBeNull();
  });

  it("formats a real timestamp", () => {
    expect(formatDateTime("2026-09-13T14:32:00.000Z")).toContain("2026");
  });
});

describe("amountsAgree", () => {
  it("compares pesewas against pesewas", () => {
    expect(amountsAgree(125_000, 125_000)).toBe(true);
    expect(amountsAgree(125_000, 124_999)).toBe(false);
  });

  it("is null when Paystack reported no amount, which is not the same as a mismatch", () => {
    expect(amountsAgree(125_000, undefined)).toBeNull();
    expect(amountsAgree(125_000, "125000")).toBeNull();
  });
});

describe("summariseTransactions", () => {
  const rows = [
    { status: "success" as const, amount: 125_000 },
    { status: "success" as const, amount: 75_000 },
    { status: "pending" as const, amount: 999_999 },
    { status: "failed" as const, amount: 50_000 },
  ];

  it("counts every row once", () => {
    const summary = summariseTransactions(rows);
    expect(summary.total).toBe(4);
    expect(summary.settled).toBe(2);
    expect(summary.unsettled).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("counts revenue from settled charges only", () => {
    expect(summariseTransactions(rows).settledPesewas).toBe(200_000);
  });

  it("is zero across the board for an empty ledger", () => {
    expect(summariseTransactions([])).toEqual({
      total: 0,
      settled: 0,
      settledPesewas: 0,
      unsettled: 0,
      failed: 0,
    });
  });
});

describe("describeVerification", () => {
  it("has nothing to say when nothing has verified the charge", () => {
    expect(describeVerification(null, 125_000)).toEqual([]);
  });

  it("omits fields Paystack never sent rather than inventing empty rows", () => {
    const lines = describeVerification({ status: "success" }, 125_000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ label: "Paystack status", value: "success" });
  });

  it("flags an amount that disagrees with what we charged", () => {
    const [line] = describeVerification({ amount: 124_000 }, 125_000);
    expect(line?.tone).toBe("amber");
    expect(line?.value).toBe("GH₵1,240.00");
  });

  it("leaves a matching amount untoned", () => {
    const [line] = describeVerification({ amount: 125_000 }, 125_000);
    expect(line?.tone).toBeUndefined();
  });

  it("reads fees as pesewas too", () => {
    const lines = describeVerification({ fees: 1_875 }, 125_000);
    expect(lines[0]).toEqual({ label: "Paystack fees", value: "GH₵18.75" });
  });
});
