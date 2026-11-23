"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, HandSwipeLeft, ShoppingBagOpen, HouseLine, Minus, Package, Plus, Storefront } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";
import { toast } from "@/lib/sonner";
import { useBag, useRemoveBagLine, useSetBagDelivery, useUpdateBagLine } from "@/features/bag/hooks/useBag";
import { useBagPayment } from "@/features/bag/hooks/useBagPayment";
import { bagPayGate } from "@/features/bag/components/bag-pay-gate";
import { buildBagSummaryRows, formatBoxTitle, formatLineMeta } from "@/features/bag/components/format";
import type { BagLine, BagView } from "@/features/bag/types";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { PaymentChannel } from "@/features/payments/types";
import type { MomoPrefill } from "@/features/payments/momo";
import type { ContactDetails } from "@/features/account/contact-details";
import { useCreateWatch } from "@/features/watches/hooks/useWatches";
import { cn } from "@/lib/utils";
import { ghs0, ghs2 } from "../format";
import { SwipeRow } from "./swipe-row";
import { PaySheet } from "./pay-sheet";
import { Sheet } from "./sheet";
import { Tap } from "./tap";

export interface MobileBagProps {
  initialBag: BagView;
  zones: DeliveryZoneRow[];
  addresses: DeliveryAddress[];
  channels: PaymentChannel[];
  pickupEnabled: boolean;
  contact: ContactDetails | null;
  pendingGroup: { id: string; item_count: number; total_ghs: number } | null;
  momoPrefill: MomoPrefill | null;
}

/** The bag: one box to Accra, swipeable lines, where it goes, and slide-to-pay with MoMo. */
export function BagScreen({ initialBag, zones, addresses, channels, pickupEnabled, contact, pendingGroup, momoPrefill }: MobileBagProps) {
  const router = useRouter();
  const bag = useBag(initialBag).data;
  const update = useUpdateBagLine();
  const remove = useRemoveBagLine();
  const setDelivery = useSetBagDelivery();
  const watch = useCreateWatch();
  const [payOpen, setPayOpen] = useState(false);
  const [payGroupId, setPayGroupId] = useState<string | null>(null);
  const [deliverOpen, setDeliverOpen] = useState(false);

  const pay = useBagPayment({
    isSignedIn: true,
    channels,
    momoPrefill,
    loginNext: "/m/bag",
    onPaid: ({ orderGroupId }) => {
      haptic("success");
      router.push(orderGroupId ? `/m/paid?group=${orderGroupId}` : "/m/paid");
    },
  });

  const gate = bagPayGate({ bag, isSignedIn: true, contact, addresses, momoReady: pay.momoReady });
  const retryGroup = payGroupId ?? pay.lastGroup?.id ?? null;
  const box = bag.boxes[0] ?? null;
  const pickups = pickupEnabled ? zones.filter((z) => z.kind === "pickup") : [];

  const openPay = (groupId: string | null) => {
    haptic("medium");
    setPayGroupId(groupId);
    setPayOpen(true);
  };

  return (
    <>
      <div className="lt up">
        <div>
          <h1>Bag</h1>
          <p>
            {bag.item_count} {bag.item_count === 1 ? "item" : "items"}
            {bag.boxes.length ? ` · ${bag.boxes.length === 1 ? "one box" : `${bag.boxes.length} boxes`} to Accra` : ""}
          </p>
        </div>
        <Tap href="/m/chat" className="icon-btn" aria-label="Add something"><Plus size={20} weight="bold" /></Tap>
      </div>

      {pendingGroup && (
        <button type="button" className="card pending up" style={{ width: "calc(100% - 32px)" }} onClick={() => openPay(pendingGroup.id)}>
          <span className="thumb" style={{ background: "#fff" }}><CreditCard size={22} weight="fill" color="var(--m-amber)" /></span>
          <span style={{ flex: 1, textAlign: "left" }}>
            <b style={{ display: "block" }}>Finish paying {ghs2(pendingGroup.total_ghs)}</b>
            <small className="muted">{pendingGroup.item_count} {pendingGroup.item_count === 1 ? "item" : "items"} from your last checkout</small>
          </span>
          <span className="link">Pay</span>
        </button>
      )}

      {bag.lines.length === 0 ? (
        <div className="empty">
          <ShoppingBagOpen size={54} weight="duotone" />
          <h3>Your bag is empty</h3>
          <p>Paste a link or ask Buy for me, and it lands here priced to your door.</p>
          <Tap href="/m/chat" className="btn btn-primary">Ask Buy for me</Tap>
        </div>
      ) : (
        <>
          {box && (
            <div className="card box-card up" style={{ marginTop: 6 }}>
              <div className="row">
                <Ring pct={box.fill_pct} />
                <div style={{ minWidth: 0 }}>
                  <b>{formatBoxTitle(box)}</b>
                  <p>
                    {bag.consolidation_saving_ghs > 0 ? (
                      <>Sharing freight saves you <b style={{ display: "inline", color: "var(--m-green-ink)" }}>{ghs0(bag.consolidation_saving_ghs)}</b></>
                    ) : (
                      "Add a second item to share the freight"
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="card lines up">
            {bag.lines.map((line) => (
              <SwipeRow
                key={line.id}
                onRemove={() =>
                  remove.mutate(
                    { id: line.id },
                    { onSuccess: () => toast({ title: `Removed ${line.product.title ?? "the item"}` }), onError: (e) => toast.error({ title: "Could not remove it", description: e.message }) },
                  )
                }
                onWatch={() =>
                  watch.mutate(
                    { url: line.product.url },
                    { onSuccess: () => toast.success({ title: "Watching it", description: "You'll hear the minute it drops." }), onError: (e) => toast.error({ title: "Could not watch it", description: e.message }) },
                  )
                }
              >
                <LineBody line={line} onQty={(q) => update.mutate({ id: line.id, quantity: q }, { onError: (e) => toast.error({ title: "Could not change it", description: e.message }) })} />
              </SwipeRow>
            ))}
          </div>
          <p className="hint"><HandSwipeLeft size={15} weight="bold" />Swipe left to remove, right to watch</p>

          <button type="button" className="card addr" onClick={() => { haptic("light"); setDeliverOpen(true); }}>
            <span className="ic">{bag.delivery?.kind === "pickup" ? <Storefront size={21} weight="fill" /> : <HouseLine size={21} weight="fill" />}</span>
            <span className="meta">
              <b>{bag.delivery ? bag.delivery.label : "Where should it go?"}</b>
              <small>{bag.delivery ? bag.delivery.zone_name : "Choose a delivery address"}</small>
            </span>
            <span className="fee nums">{bag.delivery ? ghs0(bag.delivery.fee_ghs) : "Choose"}</span>
          </button>

          <div className="card summary up">
            {buildBagSummaryRows(bag).map((r) => (
              <div key={r.key} className="brow">
                <span>{r.label}</span>
                <b style={r.tone === "saving" ? { color: "var(--m-green-ink)" } : undefined}>{r.value}</b>
              </div>
            ))}
            <div className="brow total"><span>Total</span><b className="nums">{ghs2(bag.total_ghs)}</b></div>
          </div>
          {gate.reason && <p className="fine" style={{ color: "var(--m-amber)" }}>{gate.reason}</p>}
          <p className="fine">Customs is included. If we can&apos;t buy an item, you get its money back.</p>

          <div className="paybar">
            <div><small>Total</small><b className="nums">{ghs2(bag.total_ghs)}</b></div>
            <button type="button" className="btn btn-primary" onClick={() => openPay(null)} disabled={bag.has_pending_lines}>
              {pay.isMomo ? "Pay with MoMo" : "Pay"}
            </button>
          </div>
        </>
      )}

      <PaySheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        pay={pay}
        channels={channels}
        totalGhs={payGroupId && pendingGroup?.id === payGroupId ? pendingGroup.total_ghs : (pay.lastGroup?.total_ghs ?? bag.total_ghs)}
        blockedReason={retryGroup ? (pay.momoReady ? null : "Enter your Mobile Money number to pay.") : gate.reason}
        onSlide={() => (retryGroup ? pay.payGroup(retryGroup) : pay.payBag())}
      />

      <Sheet open={deliverOpen} onClose={() => setDeliverOpen(false)} label="Deliver to">
        <div className="pay-h"><small>Deliver to</small><b style={{ fontSize: 26 }}>Where should it go?</b></div>
        {addresses.map((a) => {
          const on = bag.delivery?.address_id === a.id;
          return (
            <button
              key={a.id}
              type="button"
              className={cn("method", on && "on")}
              onClick={() => {
                haptic("select");
                setDelivery.mutate({ delivery_address_id: a.id }, { onSuccess: () => setDeliverOpen(false), onError: (e) => toast.error({ title: "Could not set that", description: e.message }) });
              }}
            >
              <span className="net"><HouseLine size={22} weight="fill" /></span>
              <span className="meta"><b>{a.label}</b><small>{[a.line1, a.area, a.city].filter(Boolean).join(", ")}</small></span>
              {on ? <Check size={20} weight="bold" color="var(--m-coral)" /> : <span className="radio" />}
            </button>
          );
        })}
        {pickups.map((z) => {
          const on = bag.delivery?.kind === "pickup" && bag.delivery.zone_id === z.id;
          return (
            <button
              key={z.id}
              type="button"
              className={cn("method", on && "on")}
              onClick={() => {
                haptic("select");
                setDelivery.mutate({ delivery_zone_id: z.id }, { onSuccess: () => setDeliverOpen(false), onError: (e) => toast.error({ title: "Could not set that", description: e.message }) });
              }}
            >
              <span className="net"><Storefront size={22} weight="fill" /></span>
              <span className="meta"><b>Pick up · {z.name}</b><small>{z.fee_ghs > 0 ? ghs0(z.fee_ghs) : "Free"}{z.note ? ` · ${z.note}` : ""}</small></span>
              {on ? <Check size={20} weight="bold" color="var(--m-coral)" /> : <span className="radio" />}
            </button>
          );
        })}
        {addresses.length === 0 && pickups.length === 0 && (
          <p className="fine">Add an address on the website for now: Account → Addresses.</p>
        )}
      </Sheet>
    </>
  );
}

function LineBody({ line, onQty }: { line: BagLine; onQty: (q: number) => void }) {
  const priced = line.pricing?.total_ghs;
  return (
    <>
      {line.product.image ? (
        <img className="pic" src={line.product.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="pic thumb"><Package size={24} /></span>
      )}
      <div className="info">
        <div className="t">{line.product.title ?? (line.pending ? "Reading the link…" : line.product.url)}</div>
        <div className="opt">{formatLineMeta(line)}</div>
        <div className="bot">
          <div className="stepper sm">
            <button type="button" aria-label="Fewer" disabled={line.quantity <= 1} onClick={() => { haptic("select"); onQty(line.quantity - 1); }}><Minus size={14} weight="bold" /></button>
            <span>{line.quantity}</span>
            <button type="button" aria-label="More" onClick={() => { haptic("select"); onQty(line.quantity + 1); }}><Plus size={14} weight="bold" /></button>
          </div>
          {priced != null ? (
            <span className="lp nums">{ghs0(priced)}</span>
          ) : (
            <span className="lp wait">{line.pending ? "Pricing…" : line.freight_checking ? "Checking freight" : (line.pricing_unavailable_reason ?? "Not priced yet")}</span>
          )}
        </div>
      </div>
    </>
  );
}

function Ring({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 22;
  const p = Math.max(0.04, Math.min(1, pct / 100));
  return (
    <span className="fill-ring">
      <svg className="r" viewBox="0 0 52 52" aria-hidden>
        <defs>
          <linearGradient id="m-ring">
            <stop offset="0" stopColor="#f43f5e" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <circle cx="26" cy="26" r="22" stroke="#f5eee9" strokeWidth="5" fill="none" />
        <circle cx="26" cy="26" r="22" stroke="url(#m-ring)" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} style={{ transition: "stroke-dashoffset .8s var(--m-ease)" }} />
      </svg>
      <span className="ic"><Package size={22} weight="fill" /></span>
    </span>
  );
}
