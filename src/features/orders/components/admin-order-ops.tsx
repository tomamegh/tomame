"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, PlusIcon, WarehouseIcon, XIcon } from "lucide-react";

import { AdminCard } from "@/components/layout/admin/admin-page";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { Order } from "../types";
import { orderEtaFields } from "./admin-order-display";
import { mayEditEtaWindow, transitionsFor, type AdminTransition } from "./admin-transitions";

/**
 * The controls that move an order: the state machine, and the delivery window.
 *
 * THE ONLY CLIENT ISLAND ON THE DETAIL SCREEN. Everything else there is server
 * rendered; this component exists because a status change is a mutation with a
 * form attached, and because the shipping transition needs three fields filled
 * in before it fires.
 *
 * It never decides what is legal. `transitionsFor` says which buttons to draw
 * (and withholds "Cancel order" from an order that has been paid for, per
 * CLAUDE.md), and the server validates the transition again against the row's
 * CURRENT status — so two admins racing each other produce one change and one
 * refusal, rather than two changes.
 *
 * After every successful write it calls `router.refresh()`. The screen is a
 * server component, so that is what re-reads the order, the audit log and the
 * journey timeline from the database — no local optimistic copy of the row that
 * could disagree with what was actually stored.
 */

export interface AdminOrderOpsProps {
  order: Order;
  /** A successful payment exists. Withholds cancellation — see `TransitionContext`. */
  hasSuccessfulPayment: boolean;
  index?: number;
}

export function AdminOrderOps({ order, hasSuccessfulPayment, index = 0 }: AdminOrderOpsProps) {
  const transitions = transitionsFor(order.status, {
    hasSuccessfulPayment,
    needsReview: order.needs_review,
  });
  const canEditEta = mayEditEtaWindow(order.status);

  if (transitions.length === 0 && !canEditEta) {
    return null;
  }

  return (
    <AdminCard
      index={index}
      title="Move this order"
      blurb="Every change here emails the customer and writes an audit row."
    >
      <div className="flex flex-col gap-5">
        {order.status === "processing" ? <ContinueAtWarehouse orderId={order.id} /> : null}
        {transitions.map((transition) => (
          <TransitionControl key={transition.to} order={order} transition={transition} />
        ))}
        {transitions.length === 0 ? (
          <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
            {order.needs_review
              ? "This order is waiting on a pricing decision. Approve it or set a price before moving it along."
              : "There is nowhere further for this order to go."}
          </p>
        ) : null}
        {canEditEta ? <EtaWindowForm order={order} /> : null}
      </div>
    </AdminCard>
  );
}

// ── One transition ──────────────────────────────────────────────────────────

function TransitionControl({
  order,
  transition,
}: {
  order: Order;
  transition: AdminTransition;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? "");
  const eta = orderEtaFields(order);
  const [etaFrom, setEtaFrom] = useState(eta.from);
  const [etaTo, setEtaTo] = useState(eta.to);
  // "Mark as purchased": the store's tracking, and whether the customer sees it.
  const isPurchase = transition.to === "processing";
  const [storeTracking, setStoreTracking] = useState<string[]>([""]);
  const [storeOrderRef, setStoreOrderRef] = useState("");
  const [shareTracking, setShareTracking] = useState(false);
  const filledTracking = storeTracking.map((t) => t.trim()).filter(Boolean);

  const busy = saving || pending;

  async function submit() {
    setSaving(true);
    try {
      // Only the shipping transition carries tracking; sending these fields on
      // any other one would be noise the service is documented to ignore.
      const body: Record<string, unknown> = { status: transition.to };
      if (isPurchase && filledTracking.length > 0) {
        body.store_tracking = filledTracking.map((tracking_number) => ({
          tracking_number,
          store_order_ref: storeOrderRef.trim() || null,
        }));
        body.share_store_tracking = shareTracking;
      }
      if (transition.carriesTracking) {
        if (carrier.trim()) body.carrier = carrier.trim();
        if (trackingNumber.trim()) body.tracking_number = trackingNumber.trim();
        if (trackingUrl.trim()) body.tracking_url = trackingUrl.trim();
        if (etaFrom) body.eta_from = etaFrom;
        if (etaTo) body.eta_to = etaTo;
      }

      await apiFetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      toast.success(
        isPurchase
          ? {
              title: "Marked as purchased",
              description:
                filledTracking.length > 0
                  ? `The hub now expects ${filledTracking.length === 1 ? "this parcel" : `${filledTracking.length} parcels`}. Continue at the warehouse from here.`
                  : "The customer has been emailed. Add the store tracking when you have it.",
            }
          : { title: "Order moved", description: transition.blurb },
      );
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error({
        title: "Could not move the order",
        description: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[14px] leading-none font-bold text-tm-ink">
          {transition.label}
        </h3>
        <p className="max-w-[60ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          {transition.blurb}
        </p>
      </div>

      {isPurchase ? (
        <PurchaseFields
          orderId={order.id}
          tracking={storeTracking}
          onTracking={setStoreTracking}
          storeOrderRef={storeOrderRef}
          onStoreOrderRef={setStoreOrderRef}
          share={shareTracking}
          onShare={setShareTracking}
        />
      ) : null}

      {transition.carriesTracking ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Carrier" id={`carrier-${order.id}`}>
            <input
              id={`carrier-${order.id}`}
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
              placeholder="DHL"
              className={INPUT}
            />
          </Field>
          <Field label="Tracking number" id={`tracking-${order.id}`}>
            <input
              id={`tracking-${order.id}`}
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              placeholder="1234567890"
              className={cn(INPUT, "tm-nums")}
            />
          </Field>
          <Field label="Tracking URL" id={`tracking-url-${order.id}`} className="sm:col-span-2">
            <input
              id={`tracking-url-${order.id}`}
              type="url"
              value={trackingUrl}
              onChange={(event) => setTrackingUrl(event.target.value)}
              placeholder="https://…"
              className={INPUT}
            />
          </Field>
          <Field label="Window opens" id={`ship-eta-from-${order.id}`}>
            <input
              id={`ship-eta-from-${order.id}`}
              type="date"
              value={etaFrom}
              onChange={(event) => setEtaFrom(event.target.value)}
              className={cn(INPUT, "tm-nums")}
            />
          </Field>
          <Field label="Window closes" id={`ship-eta-to-${order.id}`}>
            <input
              id={`ship-eta-to-${order.id}`}
              type="date"
              value={etaTo}
              min={etaFrom || undefined}
              onChange={(event) => setEtaTo(event.target.value)}
              className={cn(INPUT, "tm-nums")}
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {/*
          A destructive transition asks first. Cancellation is the one move on
          this screen that cannot be walked back — the state machine has no edge
          out of `cancelled`.
        */}
        {transition.destructive && !confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className={BUTTON_QUIET}>
            {transition.label}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            aria-busy={busy}
            className={transition.destructive ? BUTTON_DANGER : BUTTON_PRIMARY}
          >
            {busy ? "Saving…" : transition.destructive ? "Yes, cancel it" : transition.label}
          </button>
        )}
        {confirming ? (
          <button type="button" onClick={() => setConfirming(false)} className={BUTTON_QUIET}>
            Keep it
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ── Mark as purchased ───────────────────────────────────────────────────────

/** Five, like the API: more than that is a split shipment for the warehouse page. */
const MAX_STORE_TRACKING = 5;

/**
 * The store's tracking numbers from its confirmation or shipping email. Each
 * becomes an EXPECTED parcel at the hub, so the scan finds this order when the
 * box lands. Optional: the store may not have shipped yet, and the number can
 * be added later in "Store tracking" below.
 */
function PurchaseFields({
  orderId,
  tracking,
  onTracking,
  storeOrderRef,
  onStoreOrderRef,
  share,
  onShare,
}: {
  orderId: string;
  tracking: string[];
  onTracking: (next: string[]) => void;
  storeOrderRef: string;
  onStoreOrderRef: (next: string) => void;
  share: boolean;
  onShare: (next: boolean) => void;
}) {
  const hasTracking = tracking.some((t) => t.trim());
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] leading-none font-semibold text-tm-text-2">
          Store tracking number{tracking.length > 1 ? "s" : ""} (optional)
        </span>
        {tracking.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Store tracking number ${i + 1}`}
              value={value}
              onChange={(event) => onTracking(tracking.map((t, j) => (j === i ? event.target.value : t)))}
              placeholder="1Z999AA10123456784"
              className={cn(INPUT, "tm-nums")}
            />
            {tracking.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove tracking number ${i + 1}`}
                onClick={() => onTracking(tracking.filter((_, j) => j !== i))}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-tm-text-3 hover:text-tm-ink"
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
        {tracking.length < MAX_STORE_TRACKING ? (
          <button
            type="button"
            onClick={() => onTracking([...tracking, ""])}
            className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-tm-coral-strong hover:underline"
          >
            <PlusIcon className="size-3.5" aria-hidden />
            The store split it into another parcel
          </button>
        ) : null}
      </div>
      <Field label="Store order number (optional)" id={`store-ref-${orderId}`}>
        <input
          id={`store-ref-${orderId}`}
          value={storeOrderRef}
          onChange={(event) => onStoreOrderRef(event.target.value)}
          placeholder="114-3902157-0071425"
          maxLength={80}
          className={cn(INPUT, "tm-nums")}
        />
      </Field>
      <label className={cn("flex items-start gap-2.5", !hasTracking && "opacity-50")}>
        <input
          type="checkbox"
          checked={share && hasTracking}
          disabled={!hasTracking}
          onChange={(event) => onShare(event.target.checked)}
          className="mt-0.5 size-4 accent-tm-coral"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] leading-tight font-semibold text-tm-ink">Include the store tracking in the customer&apos;s email</span>
          <span className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
            Off by default: customers normally see only the Tomame number. The store&apos;s number covers the trip to our hub only.
          </span>
        </span>
      </label>
    </div>
  );
}

/** After purchase the order's next steps happen at the hub: one tap there. */
function ContinueAtWarehouse({ orderId }: { orderId: string }) {
  return (
    <Link
      href={`/warehouse/items/${orderId}`}
      className="flex items-center gap-3 rounded-[16px] border border-tm-coral/30 bg-tm-tint p-4 transition-colors hover:border-tm-coral/60"
    >
      <WarehouseIcon className="size-5 shrink-0 text-tm-coral" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] leading-tight font-bold text-tm-ink">Continue at the warehouse</span>
        <span className="text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
          Purchased and expected at the hub. Receiving, weighing and packing happen there.
        </span>
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-tm-coral" aria-hidden />
    </Link>
  );
}

// ── The delivery window ─────────────────────────────────────────────────────

/**
 * Setting the window outside a status change.
 *
 * Before this existed the window could only be written on the
 * `processing → in_transit` transition, so an operator who learned on Tuesday
 * that the box had slipped could not say so — the transition had already run and
 * the state machine correctly refuses to run it twice.
 */
function EtaWindowForm({ order }: { order: Order }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const fields = orderEtaFields(order);
  const [from, setFrom] = useState(fields.from);
  const [to, setTo] = useState(fields.to);

  const busy = saving || pending;
  const hasWindow = !!(order.eta_from || order.eta_to || order.estimated_delivery_date);

  async function save(body: Record<string, unknown>, successTitle: string) {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/orders/${order.id}/eta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success({
        title: successTitle,
        description: "The customer's journey screen now shows this.",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error({
        title: "Could not save the window",
        description: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[14px] leading-none font-bold text-tm-ink">
          Delivery window
        </h3>
        <p className="max-w-[60ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          Freight does not land on a named day, so the customer is shown a range.
          Adjusting it here writes a note to their timeline.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Opens" id={`eta-from-${order.id}`}>
          <input
            id={`eta-from-${order.id}`}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={cn(INPUT, "tm-nums")}
          />
        </Field>
        <Field label="Closes" id={`eta-to-${order.id}`}>
          <input
            id={`eta-to-${order.id}`}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className={cn(INPUT, "tm-nums")}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => save({ eta_from: from || undefined, eta_to: to || undefined }, "Window saved")}
          disabled={busy || (!from && !to)}
          aria-busy={busy}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Saving…" : hasWindow ? "Update window" : "Set window"}
        </button>
        {hasWindow ? (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              void save({ clear: true }, "Window removed");
            }}
            disabled={busy}
            className={BUTTON_QUIET}
          >
            Clear it
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────

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

const BUTTON_QUIET =
  "inline-flex h-10 items-center justify-center rounded-full border border-tm-border px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:border-tm-coral/30 hover:text-tm-ink disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_DANGER =
  "inline-flex h-10 items-center justify-center rounded-full bg-tm-coral px-5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
