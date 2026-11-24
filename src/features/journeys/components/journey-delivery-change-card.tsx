"use client";

import { orderSupportMessage } from "@/config/tracking-copy";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clock, HouseLine, LockSimple, MapPin, Phone, Plus, Storefront } from "@phosphor-icons/react/ssr";

import { AddressFormDialog } from "@/features/addresses/components/address-form-dialog";
import { addressBlockLines } from "@/features/addresses/format";
import { useAddresses, useUpdateAddress } from "@/features/addresses/hooks/useAddresses";
import { displayPhone, isContactPhone } from "@/features/addresses/phone";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { DeliveryChangeView } from "@/features/order-delivery/services/delivery-change.service";
import { slotText } from "@/features/order-delivery/delivery-windows";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { JourneyDeliverTo } from "../types";

/**
 * Change where a paid order goes, without messaging anyone (Seamless Roadmap,
 * Initiative 5): another saved address, the pickup point, or a new phone
 * number on the same address. Only choices with the delivery fee they paid are
 * offered. Open until the box for its flight closes; the deadline is shown
 * before it passes, and afterwards the reason and the WhatsApp route.
 */

const PILL =
  "inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] leading-none font-semibold text-tm-ink hover:bg-tm-paper disabled:opacity-60";
const TILE =
  "flex flex-col gap-1 rounded-2xl p-3.5 text-left transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral disabled:cursor-not-allowed";

/** "Thu 26 Nov, 00:00" in Accra (UTC). */
function when(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}, ${d.toISOString().slice(11, 16)}`;
}

function flightDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

export function JourneyDeliveryChangeCard({
  orderId,
  view,
  deliverTo,
  addresses,
  whatsappHref,
  orderNo,
  stageLabel,
}: {
  orderId: string;
  /** For the WhatsApp message, so the team knows which order and where it is. */
  orderNo: string;
  stageLabel: string | null;
  view: DeliveryChangeView;
  deliverTo: JourneyDeliverTo | null;
  addresses: DeliveryAddress[];
  whatsappHref: string | null;
}) {
  const router = useRouter();
  const { data: saved } = useAddresses(addresses, true);
  const updateAddress = useUpdateAddress();
  const [mode, setMode] = useState<"idle" | "choose" | "phone" | "window">("idle");
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const current = view.current;
  const currentAddress = current.kind === "door" ? (saved.find((a) => a.id === current.addressId) ?? null) : null;
  const [phone, setPhone] = useState(currentAddress?.phone ?? "");

  const apply = async (input: { delivery_address_id: string } | { delivery_zone_id: string }, title = "Delivery changed") => {
    setBusy(true);
    try {
      const res = await apiFetch<{ data: { changed: boolean; deliverTo: JourneyDeliverTo | null } }>(`/api/orders/${orderId}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      toast.success(
        res.data.changed
          ? { title, description: `It now goes to ${res.data.deliverTo?.label ?? "your new choice"}. We've sent you a confirmation.` }
          : { title: "Nothing to change", description: "That is already where it goes." },
      );
      setMode("idle");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't change the delivery", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const chooseWindow = async (slot: string | null) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ data: { changed: boolean } }>(`/api/orders/${orderId}/delivery-window`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const chosen = view.windowSlots.find((w) => w.key === slot);
      toast.success(
        res.data.changed
          ? { title: chosen ? "Delivery window noted" : "Window preference cleared", description: chosen ? `${slotText(chosen)}. We confirm the exact 2 hours with the rider's name.` : undefined }
          : { title: "Nothing to change" },
      );
      setMode("idle");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't save the window", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentAddress) return;
    if (!isContactPhone(phone)) {
      toast.error({ title: "Check the number", description: "Enter the full number, like 024 412 3456." });
      return;
    }
    setBusy(true);
    try {
      await updateAddress.mutateAsync({ id: currentAddress.id, input: { phone } });
    } catch (error) {
      setBusy(false);
      toast.error({ title: "Couldn't save the number", description: error instanceof Error ? error.message : "Try again." });
      return;
    }
    await apply({ delivery_address_id: currentAddress.id }, "Phone number changed");
  };

  const lock = view.lock;
  const prefSlot = view.windowSlots.find((w) => w.key === view.windowPref) ?? null;
  const eligible = (a: DeliveryAddress) => !!a.delivery_zone_id && view.doorZoneIds.includes(a.delivery_zone_id);
  const scope = view.itemCount > 1 ? `all ${view.itemCount} items in this checkout` : "this order";

  return (
    <section
      aria-labelledby="journey-delivery-change"
      data-testid="journey-delivery-change"
      className="tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.06s] [animation-duration:0.5s]"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tm-tint">
          {current.kind === "pickup" ? (
            <Storefront weight="duotone" className="size-5 text-tm-coral" aria-hidden />
          ) : (
            <HouseLine weight="duotone" className="size-5 text-tm-coral" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <h3 id="journey-delivery-change" className="text-[12px] leading-none font-semibold tracking-wide text-tm-text-3 uppercase">
            Delivery
          </h3>
          <p className="mt-1.5 text-[15px] leading-[1.35] font-semibold text-tm-ink">{deliverTo?.label ?? "Not set"}</p>
          {deliverTo?.lines.length ? (
            <p className="text-[13px] leading-[1.45] text-tm-text-2 [overflow-wrap:anywhere]">{deliverTo.lines.join(" · ")}</p>
          ) : null}
          {current.phone && (
            <p className="text-[13px] leading-[1.45] text-tm-text-2">
              Our rider calls <span className="tm-nums font-semibold text-tm-ink">{displayPhone(current.phone)}</span>
            </p>
          )}
          {current.kind === "door" && (
            <p className="text-[13px] leading-[1.45] text-tm-text-2" data-testid="delivery-window-pref">
              {prefSlot ? (
                <>
                  Preferred window <span className="font-semibold text-tm-ink">{slotText(prefSlot)}</span>
                </>
              ) : (
                "No preferred delivery window yet"
              )}
            </p>
          )}
        </div>
      </div>

      {lock.editable ? (
        <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2" data-testid="delivery-change-deadline">
          {lock.until && lock.flightOn
            ? `You can change this until ${when(lock.until)} (Accra time), when the box for its ${flightDay(lock.flightOn)} flight closes.`
            : "You can change this until its flight is booked. We'll show you the deadline as soon as the store ships it."}
        </p>
      ) : (
        <p className="flex items-start gap-2 text-[13px] leading-[1.5] font-medium text-tm-text-2" data-testid="delivery-change-locked">
          <LockSimple className="mt-0.5 size-4 shrink-0 text-tm-text-3" aria-hidden />
          <span>
            {lock.reason}{" "}
            {whatsappHref ? (
              <a
                href={`${whatsappHref}${whatsappHref.includes("?") ? "&" : "?"}text=${encodeURIComponent(orderSupportMessage(orderNo, stageLabel, "I'd like to change the delivery."))}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-tm-coral hover:underline"
              >
                Need a change? Message us on WhatsApp.
              </a>
            ) : (
              "Need a change? Message us."
            )}
          </span>
        </p>
      )}

      {lock.editable && mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PILL} onClick={() => setMode("choose")}>
            <MapPin className="size-4" aria-hidden />
            Change where it goes
          </button>
          {currentAddress && (
            <button
              type="button"
              className={PILL}
              onClick={() => {
                setPhone(currentAddress.phone);
                setMode("phone");
              }}
            >
              <Phone className="size-4" aria-hidden />
              Change phone number
            </button>
          )}
          {current.kind === "door" && view.windowSlots.length > 0 && (
            <button type="button" className={PILL} onClick={() => setMode("window")}>
              <Clock className="size-4" aria-hidden />
              {prefSlot ? "Change delivery window" : "Choose a delivery window"}
            </button>
          )}
        </div>
      )}

      {lock.editable && mode === "window" && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-tm-paper p-3.5" data-testid="delivery-window-picker">
          <p className="text-[13px] leading-[1.45] font-semibold text-tm-ink">When are you usually home?</p>
          <p className="text-[12px] leading-[1.45] text-tm-text-2">
            We aim for it. The exact 2-hour window comes with the rider&apos;s name on the day it goes out.
          </p>
          <div className="flex flex-wrap gap-2">
            {view.windowSlots.map((slot) => {
              const selected = slot.key === view.windowPref;
              return (
                <button
                  key={slot.key}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy}
                  onClick={() => chooseWindow(slot.key)}
                  className={cn(PILL, selected && "border-2 border-tm-coral bg-[#FFF8F5]")}
                >
                  {selected && <CheckCircle weight="fill" className="size-4 text-tm-coral" aria-hidden />}
                  {slotText(slot)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {view.windowPref && (
              <button type="button" disabled={busy} className={PILL} onClick={() => chooseWindow(null)}>
                Any time is fine
              </button>
            )}
            <button type="button" disabled={busy} className={PILL} onClick={() => setMode("idle")}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {lock.editable && mode === "phone" && currentAddress && (
        <form onSubmit={savePhone} className="flex flex-col gap-2.5 rounded-2xl bg-tm-paper p-3.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-tm-ink">
            The number our rider calls
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[16px] text-tm-ink outline-none focus:border-tm-coral/60"
            />
          </label>
          <p className="text-[12px] leading-[1.45] text-tm-text-2">It is saved on your {currentAddress.label} address too.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={cn(PILL, "border-transparent bg-tm-coral text-white hover:bg-tm-coral-strong")}>
              {busy ? "Saving…" : "Save number"}
            </button>
            <button type="button" disabled={busy} className={PILL} onClick={() => setMode("idle")}>
              Keep it
            </button>
          </div>
        </form>
      )}

      {lock.editable && mode === "choose" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-[1.5] text-tm-text-2">Pick where {scope} should go. It changes straight away.</p>
          <div className={cn("grid gap-3 sm:grid-cols-2", busy && "opacity-60")} aria-busy={busy}>
            {saved.map((address) => {
              const selected = current.kind === "door" && address.id === current.addressId;
              const ok = eligible(address);
              const phoneOk = isContactPhone(address.phone);
              return (
                <button
                  key={address.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy || selected || !ok || !phoneOk}
                  onClick={() => apply({ delivery_address_id: address.id })}
                  className={cn(TILE, selected ? "border-2 border-tm-coral bg-[#FFF8F5]" : "border border-tm-border hover:border-tm-coral/40", (!ok || !phoneOk) && "opacity-60")}
                >
                  <span className="flex items-center justify-between text-[11px] leading-none font-semibold tracking-wide text-tm-text-3 uppercase">
                    {address.label}
                    {selected && <CheckCircle weight="fill" className="size-[18px] text-tm-coral" aria-hidden />}
                  </span>
                  <span className="text-[13px] leading-[1.35] font-semibold text-tm-ink">{addressBlockLines(address).join(", ")}</span>
                  <span className="text-[12px] text-tm-text-2">
                    {address.recipient_name} · <span className="tm-nums">{displayPhone(address.phone)}</span>
                  </span>
                  {!ok && <span className="text-[12px] font-semibold text-tm-text-2">Different delivery fee. Message us to change to this one.</span>}
                  {ok && !phoneOk && <span className="text-[12px] font-semibold text-tm-amber">The phone number looks incomplete.</span>}
                </button>
              );
            })}
            {view.pickupZones.map((zone) => {
              const selected = current.kind === "pickup" && current.zoneId === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy || selected || !zone.sameFee}
                  onClick={() => apply({ delivery_zone_id: zone.id })}
                  className={cn(TILE, selected ? "border-2 border-tm-coral bg-[#FFF8F5]" : "border border-tm-border hover:border-tm-coral/40", !zone.sameFee && "opacity-60")}
                >
                  <span className="flex items-center justify-between">
                    <Storefront weight="duotone" className="size-5 text-tm-coral" aria-hidden />
                    {selected && <CheckCircle weight="fill" className="size-[18px] text-tm-coral" aria-hidden />}
                  </span>
                  <span className="text-[13px] leading-[1.35] font-semibold text-tm-ink">{/^pickup/i.test(zone.name) ? zone.name : `Pickup · ${zone.name}`}</span>
                  {zone.note && <span className="text-[12px] leading-[1.4] text-tm-text-2">{zone.note}</span>}
                  {!zone.sameFee && <span className="text-[12px] font-semibold text-tm-text-2">Different delivery fee. Message us to change to pickup.</span>}
                </button>
              );
            })}
            <button
              type="button"
              disabled={busy}
              onClick={() => setDialogOpen(true)}
              className="flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E8DDD6] p-3.5 text-[13px] leading-none font-semibold text-tm-text-2 hover:border-tm-coral/50"
            >
              <Plus className="size-4" aria-hidden />
              Add an address
            </button>
          </div>
          <button type="button" disabled={busy} className={cn(PILL, "self-start")} onClick={() => setMode("idle")}>
            Keep it as it is
          </button>
          <AddressFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            zones={view.doorZones}
            onCreated={(address) => {
              if (eligible(address)) void apply({ delivery_address_id: address.id });
              else toast.error({ title: "Saved, but not switched", description: "That area has a different delivery fee. Message us and we'll change it for you." });
            }}
            onUnauthorized={() => router.push(`/auth/login?next=${encodeURIComponent(`/app/orders/${orderId}`)}`)}
          />
        </div>
      )}
    </section>
  );
}
