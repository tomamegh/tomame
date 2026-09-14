"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminCard } from "@/components/layout/admin/admin-page";
import { formatGhs } from "@/features/marketing/format";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { Order, OriginCountry } from "../types";

/**
 * The hand-pricing queue, on one order.
 *
 * WHY IT EXISTS. `needs_review` (migration 013) is set when the extraction could
 * not give the pricing engine enough to work with — no price on the listing, a
 * category with no freight rule, a customer-supplied price. Such an order has no
 * total, so the customer cannot pay for it, so it sits there until a person
 * decides. This panel is that decision, and it is the reason the sidebar badges
 * `ordersNeedingReview`.
 *
 * THREE OUTCOMES, and they are not interchangeable:
 *
 * - **Approve** corrects the product facts and asks the ENGINE to price it
 *   again, under the customer's rate lock where one is still live. Use it when
 *   the extraction was merely wrong about something the engine can price.
 * - **Set price** writes `admin_total_ghs` (migration 031), which overrides the
 *   breakdown outright. Use it when the engine genuinely cannot price the thing
 *   — the note goes into the audit row so the next person can see the reasoning.
 * - **Reject** cancels the order and emails the customer why.
 *
 * No money is computed here. "Approve" hands the corrected facts to
 * `orders.review.service.ts`, which runs the calculator server-side; "Set price"
 * sends a figure a human typed. A browser never multiplies anything.
 */

export interface AdminOrderReviewPanelProps {
  order: Order;
  index?: number;
}

type Mode = "approve" | "set_price" | "reject";

export function AdminOrderReviewPanel({ order, index = 0 }: AdminOrderReviewPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("approve");

  const [productName, setProductName] = useState(order.product_name);
  const [priceUsd, setPriceUsd] = useState(
    order.estimated_price_usd != null ? String(order.estimated_price_usd) : "",
  );
  const [originCountry, setOriginCountry] = useState<OriginCountry>(order.origin_country);
  const [totalGhs, setTotalGhs] = useState(
    order.admin_total_ghs != null ? String(order.admin_total_ghs) : "",
  );
  const [note, setNote] = useState(order.admin_pricing_note ?? "");
  const [reason, setReason] = useState("");

  const busy = saving || pending;

  async function submit() {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (productName.trim() && productName.trim() !== order.product_name) {
        updates.product_name = productName.trim();
      }
      const parsedPrice = Number(priceUsd);
      if (priceUsd.trim() && Number.isFinite(parsedPrice) && parsedPrice > 0) {
        updates.estimated_price_usd = parsedPrice;
      }
      if (originCountry !== order.origin_country) updates.origin_country = originCountry;

      const body: Record<string, unknown> = { action: mode };
      if (Object.keys(updates).length > 0) body.updates = updates;

      if (mode === "set_price") {
        const parsedTotal = Number(totalGhs);
        if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
          throw new Error("Enter the total the customer should pay, in cedis.");
        }
        body.admin_total_ghs = parsedTotal;
        if (note.trim()) body.admin_pricing_note = note.trim();
      }
      if (mode === "reject" && reason.trim()) body.reason = reason.trim();

      await apiFetch(`/api/admin/orders/${order.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      toast.success({
        title: OUTCOME_TOAST[mode].title,
        description: OUTCOME_TOAST[mode].description,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error({
        title: "Could not save the decision",
        description: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCard
      index={index}
      title="This order needs a person"
      blurb="The pricing engine could not finish it. Nothing moves until you decide."
      action={<AdminBadge tone="amber">Needs review</AdminBadge>}
    >
      <div className="flex flex-col gap-5">
        <ReviewReasons reasons={order.review_reasons} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12px] leading-none font-semibold text-tm-text-2">
            What are you doing?
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(["approve", "set_price", "reject"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                aria-pressed={mode === option}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-[12.5px] leading-none font-semibold transition-colors",
                  mode === option
                    ? "border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
                    : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
                )}
              >
                {MODE_LABEL[option]}
              </button>
            ))}
          </div>
          <p className="max-w-[62ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
            {MODE_BLURB[mode]}
          </p>
        </fieldset>

        {mode !== "reject" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Product name" id="review-name" className="sm:col-span-2">
              <input
                id="review-name"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Item price (USD)" id="review-price">
              <input
                id="review-price"
                type="number"
                min="0"
                step="0.01"
                value={priceUsd}
                onChange={(event) => setPriceUsd(event.target.value)}
                className={cn(INPUT, "tm-nums")}
              />
            </Field>
            <Field label="Buying from" id="review-origin">
              <select
                id="review-origin"
                value={originCountry}
                onChange={(event) => setOriginCountry(event.target.value as OriginCountry)}
                className={INPUT}
              >
                <option value="USA">USA</option>
                <option value="UK">UK</option>
                <option value="CHINA">China</option>
              </select>
            </Field>
          </div>
        ) : null}

        {mode === "set_price" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Total the customer pays (GH₵)" id="review-total">
              <input
                id="review-total"
                type="number"
                min="0"
                step="0.01"
                value={totalGhs}
                onChange={(event) => setTotalGhs(event.target.value)}
                className={cn(INPUT, "tm-nums")}
              />
            </Field>
            <Field label="Why this figure" id="review-note" className="sm:col-span-2">
              <textarea
                id="review-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Quoted by the freight desk: oversized item, 3 boxes."
                className={cn(INPUT, "h-auto py-2.5")}
              />
            </Field>
            {Number(totalGhs) > 0 ? (
              <p className="tm-nums text-[12.5px] font-medium text-tm-text-3 sm:col-span-2">
                The customer will be asked for {formatGhs(Number(totalGhs))}.
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "reject" ? (
          <Field label="Reason (the customer is emailed this)" id="review-reason">
            <textarea
              id="review-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="The listing is no longer available from this seller."
              className={cn(INPUT, "h-auto py-2.5")}
            />
          </Field>
        ) : null}

        <div>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            aria-busy={busy}
            className={mode === "reject" ? BUTTON_DANGER : BUTTON_PRIMARY}
          >
            {busy ? "Saving…" : MODE_ACTION[mode]}
          </button>
        </div>
      </div>
    </AdminCard>
  );
}

/**
 * The engine's own words for why it stopped.
 *
 * `review_reasons` is written by `order-intake.service.ts` and is the most
 * useful thing on this panel — it is the difference between "the listing had no
 * price" and "this category has no freight rule". Shown verbatim rather than
 * mapped to friendlier copy, because an admin acting on it needs the real
 * reason, not a paraphrase.
 */
function ReviewReasons({ reasons }: { reasons: string[] | null | undefined }) {
  if (!reasons || reasons.length === 0) {
    return (
      <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
        The order was flagged without a recorded reason. Check the extraction
        snapshot below before deciding.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {reasons.map((reason) => (
        <li
          key={reason}
          className="flex items-start gap-2 text-[13px] leading-[1.5] font-medium text-tm-ink"
        >
          <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-tm-amber" />
          {reason}
        </li>
      ))}
    </ul>
  );
}

const MODE_LABEL: Record<Mode, string> = {
  approve: "Approve",
  set_price: "Set the price myself",
  reject: "Reject",
};

const MODE_BLURB: Record<Mode, string> = {
  approve:
    "Correct anything the extraction got wrong, then let the pricing engine price it again, under the customer's rate lock if one is still live.",
  set_price:
    "Write a total by hand. It overrides the breakdown entirely, so only use it when the engine genuinely cannot price this item.",
  reject:
    "Cancel the order and email the customer. There is no way back from this: the state machine has no edge out of cancelled.",
};

const MODE_ACTION: Record<Mode, string> = {
  approve: "Approve and re-price",
  set_price: "Set this price",
  reject: "Reject this order",
};

const OUTCOME_TOAST: Record<Mode, { title: string; description: string }> = {
  approve: {
    title: "Approved",
    description: "Re-priced by the engine. The customer has been emailed a payment link.",
  },
  set_price: {
    title: "Price set",
    description: "Your total overrides the breakdown. The order can now be paid for.",
  },
  reject: {
    title: "Order rejected",
    description: "It has been cancelled and the customer told why.",
  },
};

function Field({
  label,
  id,
  className,
  children,
}: {
  label: string;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[12px] leading-none font-semibold text-tm-text-2">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink placeholder:text-tm-text-3 focus:border-tm-coral/40 focus:outline-none disabled:opacity-60";

const BUTTON_PRIMARY =
  "tm-cta-gradient inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_DANGER =
  "inline-flex h-10 items-center justify-center rounded-full bg-tm-coral px-5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
