"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Clock, MapPin, NavigationArrow, Phone, SpinnerGap } from "@phosphor-icons/react/ssr";

import type { CustomerRideView, PickupAddress } from "@/features/order-delivery/customer-ride";
import { formatGhanaPhone } from "@/features/order-delivery/schema";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

/**
 * "Send your own rider" (101). Delivery from the Accra warehouse is free and
 * stays the default; this card offers the alternative once the parcel is there:
 * book an Uber, Bolt or Yango, tell us who is coming and when, and the
 * warehouse hands it over. Once handed over, the rider card (075) takes over.
 */

const SOON = [
  { label: "In about 15 min", minutes: 15 },
  { label: "In about 30 min", minutes: 30 },
  { label: "In about 1 hour", minutes: 60 },
];

const FIELD =
  "h-11 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[14px] text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60";
const PILL =
  "inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] leading-none font-semibold text-tm-ink hover:bg-tm-paper disabled:opacity-60";

export function JourneyOwnRideCard({ orderId, orderNo, ride }: { orderId: string; orderNo: string; ride: CustomerRideView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = ride.request;
  const [name, setName] = useState(request?.riderName ?? "");
  const [phone, setPhone] = useState(request?.riderPhone ? formatGhanaPhone(request.riderPhone) : "");
  const [link, setLink] = useState(request?.trackingUrl ?? "");
  const [soon, setSoon] = useState<number | "later">(30);
  const [later, setLater] = useState("");
  const [note, setNote] = useState(request?.note ?? "");

  if (!ride.eligible && !request) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const eta =
        soon === "later"
          ? later
            ? new Date(later).toISOString()
            : null
          : new Date(Date.now() + soon * 60_000).toISOString();
      await apiFetch(`/api/orders/${orderId}/ride`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rider: { courier_name: name, courier_phone: phone, tracking_url: link }, eta, note }),
      });
      toast.success({ title: "We've told the warehouse", description: "They'll have it ready for your rider." });
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not send that", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/orders/${orderId}/ride`, { method: "DELETE" });
      toast.success({ title: "Rider called off", description: "We'll deliver it to you for free." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not cancel", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tm-up flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.08s] [animation-duration:0.5s]">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-tm-pill-bg">
          <Car weight="duotone" className="size-6 text-tm-coral" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs leading-none font-semibold tracking-[0.04em] text-tm-text-3 uppercase">
            {request ? "Your rider" : "Want it sooner?"}
          </span>
          <h2 className="font-display text-lg leading-tight font-bold">
            {request ? "Your rider is coming to collect it" : "Send your own rider"}
          </h2>
          <p className="text-[13px] leading-[1.5] text-tm-text-2">
            {request
              ? "The warehouse knows and will have it ready. Show the rider your order number."
              : "Delivery is free and we'll bring it to you. If you'd rather not wait, book an Uber, Bolt or Yango to collect it from our Accra warehouse. You pay for the ride."}
          </p>
        </div>
      </div>

      {request && !editing && (
        <dl className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-[16px] bg-tm-paper p-3.5 text-[13px] sm:grid-cols-2">
          <Fact label="Rider">{request.riderName ?? "Not given"}</Fact>
          <Fact label="Rider's phone">{request.riderPhone ? formatGhanaPhone(request.riderPhone) : "Not given"}</Fact>
          <Fact label="Arriving">{request.eta ? formatTime(request.eta) : "Not given"}</Fact>
          <Fact label="Order to collect">{orderNo}</Fact>
        </dl>
      )}

      {ride.pickup && (!request || !editing) && <Pickup address={ride.pickup} />}

      {editing ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-semibold text-tm-ink">Rider&apos;s phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} placeholder="024 412 3456" className={FIELD} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-semibold text-tm-ink">
                Rider&apos;s name <span className="font-normal text-tm-text-3">(optional)</span>
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Kofi" className={FIELD} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-tm-ink">
              Trip link <span className="font-normal text-tm-text-3">(optional, lets us see where they are)</span>
            </span>
            <input value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" maxLength={2048} placeholder="https://…" className={FIELD} />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[12.5px] font-semibold text-tm-ink">When will they arrive?</legend>
            <div className="flex flex-wrap gap-2">
              {SOON.map((o) => (
                <button
                  key={o.minutes}
                  type="button"
                  onClick={() => setSoon(o.minutes)}
                  aria-pressed={soon === o.minutes}
                  className={`${PILL} ${soon === o.minutes ? "border-tm-coral bg-tm-tint" : ""}`}
                >
                  {o.label}
                </button>
              ))}
              <button type="button" onClick={() => setSoon("later")} aria-pressed={soon === "later"} className={`${PILL} ${soon === "later" ? "border-tm-coral bg-tm-tint" : ""}`}>
                Later
              </button>
            </div>
            {soon === "later" && (
              <input type="datetime-local" value={later} onChange={(e) => setLater(e.target.value)} className={FIELD} />
            )}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-tm-ink">
              Note for the warehouse <span className="font-normal text-tm-text-3">(optional)</span>
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Silver Toyota Vitz" className={FIELD} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[image:var(--tm-gradient-cta)] px-5 text-[14px] leading-none font-bold text-white disabled:opacity-60"
            >
              {busy && <SpinnerGap className="size-4 animate-spin" aria-hidden />}
              {request ? "Save changes" : "Tell the warehouse"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={PILL}>
              Never mind
            </button>
          </div>
        </form>
      ) : request ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className={PILL}>
            Change details
          </button>
          <button type="button" onClick={cancel} disabled={busy} className={PILL}>
            {busy && <SpinnerGap className="size-4 animate-spin" aria-hidden />}
            Cancel, deliver it for free
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className={`${PILL} w-fit`}>
          <Car weight="fill" className="size-4 text-tm-coral" aria-hidden />
          Send my own rider
        </button>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tm-text-3">{label}</dt>
      <dd className="tm-nums mt-0.5 font-semibold break-words text-tm-ink">{children}</dd>
    </div>
  );
}

function Pickup({ address }: { address: PickupAddress }) {
  const lines = [address.line1, [address.area, address.city].filter(Boolean).join(", ") || null].filter(Boolean);
  return (
    <div className="flex flex-col gap-2 rounded-[16px] border border-tm-border p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.04em] text-tm-text-3 uppercase">
        <MapPin weight="fill" className="size-3.5 text-tm-coral" aria-hidden />
        Pickup from
      </p>
      <p className="text-[14px] leading-[1.4] font-bold">{address.name}</p>
      {lines.length > 0 && <p className="text-[13px] leading-[1.45] text-tm-text-2">{lines.join(" · ")}</p>}
      {address.digital_address && <p className="tm-nums text-[13px] text-tm-text-2">GPS {address.digital_address}</p>}
      {address.hours && (
        <p className="flex items-center gap-1.5 text-[13px] text-tm-text-2">
          <Clock className="size-3.5" aria-hidden />
          {address.hours}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {address.maps_url && (
          <a href={address.maps_url} target="_blank" rel="noopener noreferrer" className={PILL}>
            <NavigationArrow weight="fill" className="size-4 text-tm-coral" aria-hidden />
            Open in Maps
          </a>
        )}
        {address.phone && (
          <a href={`tel:${address.phone.replace(/\s+/g, "")}`} className={PILL}>
            <Phone weight="fill" className="size-4 text-tm-coral" aria-hidden />
            <span className="tm-nums">{address.phone}</span>
          </a>
        )}
      </div>
    </div>
  );
}

/** "Tue 11 Nov, 15:40" in Accra (GMT year-round). */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(date);
}
