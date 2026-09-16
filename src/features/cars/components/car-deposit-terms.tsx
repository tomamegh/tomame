import { LockSimple, ShieldCheck } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { formatPesewas } from "../format";
import {
  isPaidInFull,
  purchaseCopy,
  termsSummaryLine,
  type CarPurchaseTermsView,
} from "./purchase";

export interface CarDepositTermsProps {
  /** The server's struck figures. Never null here: the caller draws nothing when it cannot price the car. */
  terms: CarPurchaseTermsView;
  /** `panel` is the aside and the content column; `compact` is the phone's sticky bar. */
  size?: "panel" | "compact";
  className?: string;
}

/**
 * The three numbers, before the press.
 *
 * WHY THIS EXISTS AT ALL. A car is GH₵120,000 to GH₵260,000 and no Ghanaian
 * MoMo wallet moves that in one transaction, so Paystack takes a DEPOSIT and
 * the balance is settled by bank transfer or in person. That is a fine way to
 * sell a car and a terrible thing to discover on Paystack's screen. Every
 * figure involved is therefore printed BEFORE the button: what the car costs,
 * what is being taken now, and what is still owed. The button under it names
 * the deposit again (`depositButtonLabel`), so the sum appears twice and the
 * customer cannot reach the payment page without having read it.
 *
 * IT NEVER PRINTS A FIGURE IT WAS NOT GIVEN. There is no arithmetic in this
 * file: `payable`, `deposit` and `balance` all arrive already struck by
 * `getCarPurchaseTerms`, and the only thing resembling a sum is
 * `isPaidInFull`, a comparison that decides whether to promise a balance at
 * all. Deriving the balance here from the other two would be the same class of
 * mistake as the landed-cost card inventing a residual line, and that card
 * refuses to draw rather than do it.
 *
 * A PRIVATE FIGURE SAYS IT IS PRIVATE. When `source` is `quote` or
 * `accepted_offer` the number belongs to this customer alone: it is what an
 * admin quoted them on a car whose public page says "Price on request", or the
 * offer we accepted from them on a car whose asking price is still on display.
 * The heading names it ("The price we quoted you") and a lock pill repeats it,
 * because a six-figure number that has silently replaced another six-figure
 * number a few pixels above it has to explain itself.
 *
 * A Server Component by default, and it holds no state, so the phone bar can
 * render it inside a client island without dragging anything along.
 */
export function CarDepositTerms({
  terms,
  size = "panel",
  className,
}: CarDepositTermsProps) {
  const copy = purchaseCopy(terms);
  const full = isPaidInFull(terms);
  const compact = size === "compact";

  if (compact) {
    /*
      TWO LINES, NOT THE PANEL'S FIVE, AND THE BUDGET IS THE REASON.

      The phone's bar is `position: sticky` with a bottom offset, so while it is
      pinned it DRAWS OVER the page beneath it: every pixel it takes is a pixel
      of the car the customer cannot see. On a quoted car it already carries a
      deposit button, a greyed ask button and the admin's reply, and the full
      panel on top of that put it at 287px, a third of an 844px phone, before
      the 84px tab bar underneath. So the headline figure and the row table
      stand down here and the summary line carries all three sums instead. The
      panel itself is not lost: `lg:hidden` puts a full copy in the content
      column, directly under the price, which is where somebody reading rather
      than pressing will find it.

      WHAT DOES NOT STAND DOWN IS THE COUNT. All three figures are on the line,
      in the panel's order, because this is the copy of the button a thumb
      actually reaches and nobody should press it having read two of them.
    */
    return (
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[12px] leading-none font-bold text-tm-text-2">
            {copy.heading}
          </span>
          {copy.isPrivate && <PrivatePill />}
        </span>

        {/* Wraps rather than truncates. A strip that truncates inside a track
            which can still grow reports a width it never shows, and that is
            what has widened this app's phone layouts before. */}
        <span className="tm-nums min-w-0 text-[13px] leading-[1.35] font-bold text-tm-ink">
          {termsSummaryLine(terms)}
        </span>
      </div>
    );
  }

  return (
    <section
      aria-label={copy.heading}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[18px] border border-tm-border bg-tm-pill-bg p-4",
        className,
      )}
    >
      <header className="flex min-w-0 flex-col gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[12.5px] leading-none font-bold text-tm-text-2">
            {copy.heading}
          </span>
          {copy.isPrivate && <PrivatePill />}
        </span>

        <span className="tm-nums min-w-0 text-[26px] leading-none font-bold text-tm-ink">
          {formatPesewas(terms.payablePesewas)}
        </span>
      </header>

      {/*
        A definition list, not a table. There are two or three pairs and no
        column headings, so `<dl>` is what they are; a screen reader reads each
        label with its figure instead of announcing a one-column grid.
      */}
      <dl className="flex min-w-0 flex-col gap-1.5 border-t border-tm-border pt-3">
        <TermsRow label={copy.totalLabel} value={formatPesewas(terms.payablePesewas)} />
        <TermsRow
          label={copy.depositLabel}
          value={formatPesewas(terms.depositPesewas)}
          emphasis
        />
        {!full && (
          <TermsRow
            label={copy.balanceLabel}
            value={formatPesewas(terms.balancePesewas)}
          />
        )}
      </dl>

      <p className="flex min-w-0 gap-2 text-[12px] leading-[1.45] font-medium text-tm-text-2">
        <ShieldCheck
          weight="duotone"
          className="mt-px size-4 shrink-0 text-tm-green"
          aria-hidden
        />
        <span className="min-w-0">{copy.settlement}</span>
      </p>
    </section>
  );
}

/** One label and its figure. `emphasis` marks the sum about to be charged. */
function TermsRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    /* `gap-x-3` plus `minmax` behaviour from flex: the label wraps and the
       figure never does, which is the only arrangement that survives a
       six-figure amount beside a long label at 390px. */
    <div className="flex min-w-0 items-baseline justify-between gap-x-3">
      <dt
        className={cn(
          "min-w-0 text-[12.5px] leading-[1.35] font-semibold",
          emphasis ? "text-tm-ink" : "text-tm-text-2",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "tm-nums shrink-0 leading-none whitespace-nowrap",
          emphasis
            ? "text-[15px] font-bold text-tm-coral-strong"
            : "text-[13.5px] font-bold text-tm-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * "Private to you".
 *
 * Small, and deliberately not a warning colour. It is a fact about who the
 * figure belongs to, not a caution, and the amber treatment used for things a
 * customer must act on would read as one.
 */
function PrivatePill() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-tm-tint px-2 py-1 text-[10.5px] leading-none font-bold text-tm-coral-strong">
      <LockSimple weight="fill" className="size-3 shrink-0" aria-hidden />
      Private to you
    </span>
  );
}
