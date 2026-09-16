import type { AdminTone } from "@/components/layout/admin";
import {
  CAR_ORDER_STATUSES,
  CAR_PRICE_SOURCES,
  type CarPriceSource,
} from "@/features/cars/car-orders.types";
import { formatPesewas } from "@/features/cars/format";

import { parseCedis } from "../car-form-state";

/**
 * How a car sale's money reads on the admin screen (migrations 068, 069).
 *
 * PURE AND FRAMEWORK FREE, on the same contract as `car-form-state.ts` next
 * door: no React, no Supabase, no clock. Everything here has a right answer, so
 * everything here has a test, and three of them are answers the product would be
 * wrong without:
 *
 *   1. NOTHING HERE COMPUTES A DEPOSIT. `deposit_pesewas`, `balance_pesewas` and
 *      `price_pesewas` are all ON THE ROW, snapshotted at checkout, and
 *      `balance_pesewas` is a generated column the database maintains. A screen
 *      that took the deposit percentage and multiplied would print a figure the
 *      customer was never charged the first time an admin moved the setting,
 *      and it would do it on the screen where somebody decides how much money to
 *      go and ask for.
 *
 *   2. WHAT WAS RECEIVED IS READ FROM THE STATE MACHINE AND THE ROW, not from
 *      adding up payments. `paid` means fully paid by definition (069);
 *      `deposit_paid` means the deposit settled and nothing else has. The
 *      payments attached to a car order include the ones that FAILED, and a
 *      screen that summed them without care would report a balance as collected
 *      because somebody retried their card four times.
 *
 *   3. CEDIS BECOME PESEWAS THROUGH `parseCedis`, WHICH IS ALREADY WRITTEN.
 *      Money is an INTEGER number of pesewas everywhere in this product and the
 *      conversion is done by splitting the string rather than by
 *      `Math.round(value * 100)`, which loses or gains a coin on figures a form
 *      genuinely sees. Here that coin is the difference between a recorded
 *      balance and a 400 from `recordCarBalancePayment`, which compares the
 *      amount to the outstanding figure to the pesewa. A second converter living
 *      in this file would be a second place for that bug to come back.
 *
 * British English, as the rest of the product.
 */

// ── What is in, and what is still out ───────────────────────────────────────

/** The `car_orders` columns this screen reasons about, and only those. */
export interface CarSaleFigures {
  status: string;
  /** The FULL agreed price. Not always the listing's figure, from 069. */
  pricePesewas: number;
  /** What Paystack was asked for up front, snapshotted at checkout. */
  depositPesewas: number;
  /** The whole-percent setting that produced it. 100 on every pre-069 row. */
  depositPercent: number;
  /** `price_pesewas - deposit_pesewas`, computed by the database. */
  balancePesewas: number;
  /** What an admin recorded as received offline, once one has. */
  balanceAmountPesewas: number | null;
  depositPaidAt: string | null;
}

export interface CarOrderMoney extends CarSaleFigures {
  /** The deposit has settled through Paystack. */
  depositSettled: boolean;
  /** Everything agreed has been received. */
  fullyPaid: boolean;
  /** The deposit is in and the balance is not. The only state that is work. */
  awaitingBalance: boolean;
  /** Everything received so far, deposit and recorded balance together. */
  receivedPesewas: number;
  /** Agreed minus received, floored at zero. */
  outstandingPesewas: number;
}

/**
 * The sale's arithmetic, from the row.
 *
 * `paid` AND EVERYTHING PAST IT MEAN FULLY PAID, which is 069's own definition
 * and is why the received figure is the whole price in those states rather than
 * the sum of anything. A 100% deposit settles straight from `pending_payment` to
 * `paid` and never carries a `deposit_paid_at` worth reading, so deriving the
 * received amount from that timestamp alone would report a car that is bought
 * and gone as having had nothing paid on it.
 *
 * A CANCELLED SALE KEEPS ITS FIGURES. Unwinding refunds nothing (the route says
 * so at length), so a car released after its deposit settled has real money
 * sitting against it, and an admin arranging the refund needs to see how much.
 */
export function readCarOrderMoney(figures: CarSaleFigures): CarOrderMoney {
  const fullyPaid = SETTLED_STATUSES.has(figures.status);
  const depositSettled = fullyPaid || figures.depositPaidAt !== null;
  const awaitingBalance = figures.status === CAR_ORDER_STATUSES.DEPOSIT_PAID;

  const receivedPesewas = fullyPaid
    ? figures.pricePesewas
    : depositSettled
      ? figures.depositPesewas
      : 0;

  return {
    ...figures,
    depositSettled,
    fullyPaid,
    awaitingBalance,
    receivedPesewas,
    outstandingPesewas: Math.max(0, figures.pricePesewas - receivedPesewas),
  };
}

/** Everything from `paid` onwards. The same set `car-orders.service.ts` keeps. */
const SETTLED_STATUSES: ReadonlySet<string> = new Set([
  CAR_ORDER_STATUSES.PAID,
  CAR_ORDER_STATUSES.PROCESSING,
  CAR_ORDER_STATUSES.IN_TRANSIT,
  CAR_ORDER_STATUSES.DELIVERED,
]);

// ── What actually came through Paystack ─────────────────────────────────────

/**
 * A `payments` row attached to a car order, reduced to what a screen shows.
 *
 * SHOWN AS EVIDENCE, NEVER SUMMED INTO THE FIGURES ABOVE. The failed and
 * abandoned attempts are on this list too, because an admin about to chase a
 * balance wants to see that the customer tried four times and gave up, which is
 * usually the explanation for a transfer turning up in the bank instead.
 */
export interface CarOrderPayment {
  id: string;
  /** Integer pesewas, as stored. */
  amountPesewas: number;
  /** `pending` | `success` | `failed`, as stored (005). */
  status: string;
  /** "mobile_money", "card", or null on a row that never reached Paystack. */
  channel: string | null;
  reference: string;
  createdAt: string;
}

// ── Where the price came from ───────────────────────────────────────────────

export interface PriceOriginReading {
  source: CarPriceSource | "unknown";
  /** A phrase, not a slug. Printed as it stands. */
  label: string;
  /** What the listing asks today, when that is a different number. */
  note: string | null;
}

/**
 * Was this customer charged the listing price, a quote, or an accepted offer?
 *
 * WHY IT MATTERS ENOUGH TO PUT ON EVERY ROW. An on-request car carries no public
 * price at all (067's `car_listings_price_state_has_price`), so the only figure
 * it can be sold at is one a person quoted; and a negotiable car that sold below
 * its listing is not a mistake, it is an offer somebody accepted. An admin who
 * does not know a figure was agreed in a conversation will "correct" it against
 * the listing and chase a customer for money they never owed. 069 put
 * `price_source` on the row precisely so a dispute needs no join, and this is
 * the screen that reads it.
 *
 * THE ROW'S OWN WORD IS THE ONLY SOURCE. Nothing is inferred by matching figures
 * against enquiries: two enquiries on one car can hold two numbers, a near miss
 * is not a match, and a confident sentence under an untraceable figure is worse
 * than no sentence. An unrecognised value says so.
 */
export function readPriceOrigin(input: {
  source: string;
  pricePesewas: number;
  /** What the listing asks today. Null for an on-request car. */
  listingPricePesewas: number | null;
}): PriceOriginReading {
  const { source, pricePesewas, listingPricePesewas } = input;

  const note =
    listingPricePesewas !== null && listingPricePesewas !== pricePesewas
      ? `The listing asks ${formatPesewas(listingPricePesewas)} today.`
      : listingPricePesewas === null
        ? "This car carries no public price, so the figure was agreed in a conversation."
        : null;

  switch (source) {
    case CAR_PRICE_SOURCES.LISTING:
      return { source: CAR_PRICE_SOURCES.LISTING, label: "The listing price", note };
    case CAR_PRICE_SOURCES.QUOTE:
      return { source: CAR_PRICE_SOURCES.QUOTE, label: "A price we quoted", note };
    case CAR_PRICE_SOURCES.ACCEPTED_OFFER:
      return {
        source: CAR_PRICE_SOURCES.ACCEPTED_OFFER,
        label: "An offer we accepted",
        note,
      };
    default:
      return { source: "unknown", label: "Source not recorded", note };
  }
}

// ── Status ──────────────────────────────────────────────────────────────────

export interface CarOrderStatusReading {
  label: string;
  tone: AdminTone;
  /** One line about what the state means for the person reading it. */
  blurb: string;
  /** A person still owes somebody an action on this sale. */
  needsAction: boolean;
}

/**
 * The status in words.
 *
 * KEYED BY STRING WITH A FALLBACK rather than exhaustively over `CarOrderStatus`.
 * The machine gained a state in 069 and may gain another; a lookup renders an
 * unknown one as itself rather than as a blank cell, which on a screen about
 * six-figure sums is the difference between an odd label and a row that appears
 * to say nothing. The enquiry queue next door reads its statuses the same way.
 */
export function readCarOrderStatus(status: string): CarOrderStatusReading {
  return (
    STATUS_READING[status] ?? {
      label: status,
      tone: "neutral",
      blurb: "This sale is in a state this screen does not have words for yet.",
      needsAction: false,
    }
  );
}

const STATUS_READING: Record<string, CarOrderStatusReading> = {
  [CAR_ORDER_STATUSES.PENDING_PAYMENT]: {
    label: "Awaiting deposit",
    tone: "neutral",
    blurb:
      "The car is held and no money has arrived. If the customer never finishes, the reconciliation sweep releases it and the car goes back on sale.",
    needsAction: false,
  },
  [CAR_ORDER_STATUSES.DEPOSIT_PAID]: {
    label: "Balance due",
    tone: "coral",
    blurb:
      "The deposit has settled and the car is reserved. The customer has paid us and does not yet own the car outright: the balance is arranged directly, and somebody records it here when it arrives.",
    needsAction: true,
  },
  [CAR_ORDER_STATUSES.PAID]: {
    label: "Paid in full",
    tone: "green",
    blurb: "The deposit settled and the balance was recorded. Nothing is outstanding.",
    needsAction: false,
  },
  [CAR_ORDER_STATUSES.PROCESSING]: {
    label: "Being processed",
    tone: "neutral",
    blurb: "Paid in full, and the paperwork is being done.",
    needsAction: false,
  },
  [CAR_ORDER_STATUSES.IN_TRANSIT]: {
    label: "In transit",
    tone: "neutral",
    blurb: "Paid in full, and on its way to the customer.",
    needsAction: false,
  },
  [CAR_ORDER_STATUSES.DELIVERED]: {
    label: "Delivered",
    tone: "green",
    blurb: "The customer has the car.",
    needsAction: false,
  },
  [CAR_ORDER_STATUSES.CANCELLED]: {
    label: "Unwound",
    tone: "muted",
    blurb:
      "This sale is over and the car is free to be sold again. Any money taken is unaffected by that.",
    needsAction: false,
  },
};

// ── The balance an admin types ──────────────────────────────────────────────

export type BalanceCheck =
  | { ok: false; problem: string }
  | { ok: true; pesewas: number };

/**
 * What the admin typed, against what the row says is outstanding.
 *
 * IT MIRRORS `recordCarBalancePayment`, WHICH IS THE AUTHORITY. That service
 * refuses any amount that is not the outstanding figure to the pesewa, and it
 * refuses it for a reason worth restating: a part payment would need its own
 * ledger, with several rows, a running total and a definition of "enough", and
 * letting the amount be whatever somebody types would smuggle that in one
 * half-recorded sale at a time. Everything this function does, the server does
 * again. What it buys is that an admin never meets the refusal as a 400 after
 * pressing a button on a five-figure sale.
 *
 * AND YET THE FIGURE STILL HAS TO BE TYPED. The field is never pre-filled with
 * the outstanding amount, because a control that agrees with itself by default
 * is a control where nobody read the number: the commonest path through it would
 * be one where a five-figure debt was declared settled without anybody looking.
 * The expected figure sits BESIDE the field instead, so it can be checked
 * against a bank statement rather than accepted from the screen.
 *
 * BLANK IS A PROBLEM HERE, though `parseCedis` treats it as a legal empty
 * answer: a car listing may be written without a price, and a balance may not be
 * recorded without a figure.
 */
export function checkBalanceAmount(raw: string, expectedPesewas: number): BalanceCheck {
  const parsed = parseCedis(raw);
  if (!parsed.ok) return { ok: false, problem: parsed.problem };
  if (parsed.pesewas === null) {
    return { ok: false, problem: "Type the amount that actually arrived." };
  }
  if (parsed.pesewas <= 0) {
    return { ok: false, problem: "A balance has to be an amount greater than zero." };
  }
  if (parsed.pesewas !== expectedPesewas) {
    return { ok: false, problem: describeBalanceGap(parsed.pesewas, expectedPesewas) };
  }
  return { ok: true, pesewas: parsed.pesewas };
}

/**
 * The mismatch, in a sentence naming both figures.
 *
 * Written out here rather than left as a number for the JSX to arrange, so the
 * wording is fixed by a test instead of by whoever last edited the component,
 * and so it says the same thing as the server's own refusal.
 */
export function describeBalanceGap(typedPesewas: number, expectedPesewas: number): string {
  const difference = typedPesewas - expectedPesewas;
  const direction = difference > 0 ? "more than" : "less than";
  return `The balance on this sale is ${formatPesewas(expectedPesewas)}. You have typed ${formatPesewas(
    typedPesewas,
  )}, which is ${formatPesewas(Math.abs(difference))} ${direction} that. Only the exact balance can be recorded: anything else is a separate arrangement.`;
}
