import type { AdminTone } from "@/components/layout/admin";
import { formatGhs } from "@/features/marketing/format";
import type { AdminMoneyCustomer, AdminPaymentStatus } from "@/db/queries/admin-money";

/**
 * Display helpers for the admin money screens.
 *
 * THE ONE THING THIS FILE IS FOR. `payments.amount` is pesewas (GHS × 100)
 * because that is the unit Paystack charges in; every other figure on the
 * platform is cedis. Crossing that boundary inline in a component is how a
 * screen ends up showing GH₵1,250,000 for a GH₵12,500 charge, so it is crossed
 * exactly once, here, in a function whose name says which unit it takes. No
 * component in the admin may divide an amount by 100.
 *
 * Everything here is pure and takes `now` rather than reading the clock, so a
 * server render and its hydration cannot disagree.
 */

/** Pesewas → "GH₵1,250.00". The only pesewas→cedis conversion in the admin. */
export function formatPesewas(pesewas: number): string {
  return formatGhs(pesewas / 100);
}

/**
 * Tone for a payment status.
 *
 * `pending` is amber on purpose: an unsettled charge is somebody's unfinished
 * business — either the customer never completed it or nothing has verified it
 * yet — and amber is the admin's "a human still owes an action" colour. A
 * failed charge is not an operational error to chase, so it stays muted.
 */
export function transactionTone(status: AdminPaymentStatus): AdminTone {
  switch (status) {
    case "success":
      return "green";
    case "pending":
      return "amber";
    case "failed":
      return "muted";
  }
}

/**
 * Takes a plain string, not the union, on purpose: it also labels a status that
 * came back from Paystack's own payload, where "abandoned" is a real answer the
 * `payments` CHECK constraint has no room for. An unrecognised value is printed
 * as it arrived rather than dropped — an empty cell would be the worse lie.
 */
export function transactionStatusLabel(status: string): string {
  switch (status) {
    case "success":
      return "Paid";
    case "pending":
      return "Unsettled";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

/**
 * Paystack's channel slug, humanised. Returns null when the column is empty —
 * the channel is only written once a charge settles, so a pending payment
 * genuinely does not have one and the screen must not guess "Card".
 */
export function channelLabel(channel: string | null): string | null {
  if (!channel) return null;
  const cleaned = channel.replace(/_/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** "Ama Mensah", or the email, or null. Never "Unknown User". */
export function customerName(customer: AdminMoneyCustomer | null): string | null {
  if (!customer) return null;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  return customer.email ?? null;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "13 Sep 2026, 14:32". Returns null on junk rather than "Invalid Date". */
export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return dateTimeFormatter.format(date);
}

/**
 * Whether the amount Paystack reported matches the amount we charged.
 *
 * `handlePaymentCallback` refuses to mark a payment paid when these disagree,
 * and when that happens the transaction sits pending with a verification
 * payload that says "success" — the single most confusing state in the system.
 * The screen has to be able to name it, so the comparison lives here with the
 * rest of the pesewas handling. Both figures are pesewas.
 */
export function amountsAgree(chargedPesewas: number, paystackAmount: unknown): boolean | null {
  if (typeof paystackAmount !== "number") return null;
  return paystackAmount === chargedPesewas;
}

/**
 * The four figures at the top of the transactions screen.
 *
 * Aggregated here rather than in the page so it is a tested pure function over
 * rows that already exist — `AdminStat` renders formatted strings and never
 * computes, and a total that only lives inside JSX cannot be checked.
 *
 * Revenue counts settled charges only. A pending charge is money nobody has
 * yet, and counting it would overstate the day's takings on the one screen an
 * admin uses to reconcile them.
 */
export interface AdminTransactionSummary {
  total: number;
  settled: number;
  settledPesewas: number;
  unsettled: number;
  failed: number;
}

export function summariseTransactions(
  rows: readonly { status: AdminPaymentStatus; amount: number }[],
): AdminTransactionSummary {
  let settled = 0;
  let settledPesewas = 0;
  let unsettled = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.status === "success") {
      settled += 1;
      settledPesewas += row.amount;
    } else if (row.status === "pending") {
      unsettled += 1;
    } else {
      failed += 1;
    }
  }

  return { total: rows.length, settled, settledPesewas, unsettled, failed };
}

/**
 * The stored Paystack payload, turned into the handful of lines worth reading.
 *
 * `metadata.paystack_verification` is Paystack's whole `data` object — dozens
 * of fields, most of them noise. The screen shows these six because they are
 * the ones that answer "did this go through, when, how, and for how much", and
 * the raw payload stays available underneath for the rest.
 *
 * A field Paystack did not send is omitted rather than rendered as "—": this
 * panel is the record of what Paystack actually said, and inventing an empty
 * row for something it never mentioned would misrepresent it.
 */
export interface VerificationLine {
  label: string;
  value: string;
  /** Set when the line contradicts what we hold and needs a human. */
  tone?: "amber";
}

export function describeVerification(
  raw: Record<string, unknown> | null,
  chargedPesewas: number,
): VerificationLine[] {
  if (!raw) return [];
  const lines: VerificationLine[] = [];

  if (typeof raw.status === "string") {
    lines.push({ label: "Paystack status", value: raw.status });
  }

  const paidAt = formatDateTime(typeof raw.paid_at === "string" ? raw.paid_at : null);
  if (paidAt) lines.push({ label: "Paid at", value: paidAt });

  const channel = channelLabel(typeof raw.channel === "string" ? raw.channel : null);
  if (channel) lines.push({ label: "Channel", value: channel });

  if (typeof raw.amount === "number") {
    const agrees = amountsAgree(chargedPesewas, raw.amount);
    lines.push({
      label: "Amount Paystack reports",
      value: formatPesewas(raw.amount),
      tone: agrees === false ? "amber" : undefined,
    });
  }

  // Paystack's own cut, also in pesewas. Worth showing: it is the difference
  // between what the customer paid and what lands in the account.
  if (typeof raw.fees === "number") {
    lines.push({ label: "Paystack fees", value: formatPesewas(raw.fees) });
  }

  if (typeof raw.gateway_response === "string" && raw.gateway_response.trim()) {
    lines.push({ label: "Gateway response", value: raw.gateway_response });
  }

  if (typeof raw.id === "number") {
    lines.push({ label: "Paystack ID", value: String(raw.id) });
  }

  return lines;
}
