"use client";

import { useRef, useState } from "react";
import { ArrowRight, CreditCard, DeviceMobileCamera, WarningCircle } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";
import type { BagPayment } from "@/features/bag/hooks/useBagPayment";
import type { PaymentChannel } from "@/features/payments/types";
import { cn } from "@/lib/utils";
import { ghs0, ghs2 } from "../format";
import { Sheet } from "./sheet";

const NET_CLASS: Record<string, string> = { mtn: "mtn", vod: "telecel", atl: "at" };
const NET_SHORT: Record<string, string> = { mtn: "MTN", vod: "Telecel", atl: "AT" };

/**
 * Pay once for everything. Every step is `useBagPayment`'s: checkout re-prices server-side, then
 * MoMo sends a prompt to the phone (or card hands over to Paystack). The sheet only picks the
 * channel and number, takes the slide, and shows the prompt's state — approve, code, failed.
 */
export function PaySheet({
  open,
  onClose,
  pay,
  channels,
  totalGhs,
  blockedReason,
  onSlide,
}: {
  open: boolean;
  onClose: () => void;
  pay: BagPayment;
  channels: PaymentChannel[];
  totalGhs: number;
  blockedReason: string | null;
  onSlide: () => void;
}) {
  const momo = pay.momo;
  const waiting = pay.handoff === "momo" || pay.handoff === "paid" || momo?.state === "approve";

  return (
    <Sheet open={open} onClose={onClose} label="Pay">
      {waiting ? (
        <div className="approve">
          <div className="phone"><DeviceMobileCamera size={48} weight="fill" /></div>
          <h3>{pay.handoff === "momo" ? "Sending the prompt…" : pay.handoff === "paid" ? "Paid" : "Check your phone"}</h3>
          <p>
            {momo?.state === "approve"
              ? momo.message || `Approve the MoMo prompt on ${pay.momoPhone} with your PIN.`
              : `We're sending a prompt to ${pay.momoPhone}.`}
          </p>
          {pay.momoSlow && <p className="fine">Taking a while? Dial *170# → My Approvals, or try again.</p>}
          {momo?.state === "approve" && (
            <div className="pad" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => { haptic("light"); pay.checkMomo(); }}>I&apos;ve approved it</button>
            </div>
          )}
        </div>
      ) : momo?.state === "otp" ? (
        <OtpStep pay={pay} message={momo.message} />
      ) : (
        <>
          <div className="pay-h">
            <small>Pay once for everything</small>
            <b className="nums">{ghs2(totalGhs)}</b>
          </div>
          {momo?.state === "failed" && (
            <p className="note" style={{ margin: "12px 16px 0", display: "flex", gap: 8 }}>
              <WarningCircle size={18} weight="fill" style={{ flex: "none" }} />
              {momo.message || "The payment didn't go through. Try again."}
            </p>
          )}
          {channels.map((c) => {
            const on = c.id === pay.channelId;
            const isCard = c.paystack_channel === "card";
            return (
              <button
                key={c.id}
                type="button"
                className={cn("method", on && "on")}
                onClick={() => {
                  haptic("select");
                  pay.setChannelId(c.id);
                }}
              >
                <span className={cn("net", c.provider ? NET_CLASS[c.provider] : "")}>
                  {isCard ? <CreditCard size={22} /> : c.provider ? NET_SHORT[c.provider] : "MoMo"}
                </span>
                <span className="meta">
                  <b>{c.label}</b>
                  <small>{isCard ? "Visa or Mastercard via Paystack" : "Mobile Money prompt on your phone"}</small>
                </span>
                <span className="radio" />
              </button>
            );
          })}
          {pay.isMomo && (
            <label className="phone-in">
              <span className="cc">🇬🇭</span>
              <input
                inputMode="tel"
                autoComplete="tel"
                placeholder="055 123 4567"
                value={pay.momoPhone}
                onChange={(e) => pay.setMomoPhone(e.target.value)}
                aria-label="Mobile Money number"
              />
            </label>
          )}
          <button type="button" className="watch-row" style={{ marginTop: 8 }} onClick={() => { haptic("light"); pay.setWhatsappUpdates(!pay.whatsappUpdates); }}>
            <span style={{ flex: 1, textAlign: "left" }}><b>Updates on WhatsApp</b><small>Stage changes and your delivery code</small></span>
            <span className={cn("toggle", pay.whatsappUpdates && "on")} />
          </button>
          {blockedReason ? (
            <p className="err">{blockedReason}</p>
          ) : null}
          <SlideToPay
            label={pay.busy ? pay.busyLabel : `Slide to pay ${ghs0(totalGhs)}`}
            disabled={!!blockedReason || pay.busy}
            onComplete={onSlide}
          />
          <p className="fine">Secured by Paystack.{pay.isMomo ? ` You'll get a prompt on ${pay.momoPhone || "your phone"}.` : ""}</p>
        </>
      )}
    </Sheet>
  );
}

function OtpStep({ pay, message }: { pay: BagPayment; message: string }) {
  const [otp, setOtp] = useState("");
  return (
    <form
      className="approve"
      onSubmit={(e) => {
        e.preventDefault();
        haptic("medium");
        pay.submitMomoOtp(otp);
      }}
    >
      <h3>Enter the code</h3>
      <p>{message || "Your network sent a one-time code by SMS."}</p>
      <div className="otp">
        <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus aria-label="One-time code" />
      </div>
      <div className="pad" style={{ marginTop: 14 }}>
        <button type="submit" className="btn btn-primary btn-block" disabled={!otp || pay.otpBusy}>{pay.otpBusy ? "Checking…" : "Confirm"}</button>
      </div>
    </form>
  );
}

/** Drag the knob to the end to pay: selection ticks along the way, a heavy thud at the end. */
export function SlideToPay({ label, disabled, onComplete }: { label: string; disabled: boolean; onComplete: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const x0 = useRef(0);
  const max = useRef(0);
  const quarter = useRef(0);

  return (
    <div
      ref={track}
      className={cn("slider", dragging && "dragging")}
      aria-disabled={disabled}
      style={{ ["--x" as string]: `${x}px`, ["--p" as string]: `${x ? x + 58 : 0}px`, ["--lo" as string]: String(max.current ? 1 - x / max.current : 1) }}
    >
      <div className="fillg" />
      <div className="lbl"><span>{label}</span></div>
      <div
        className="knob"
        role="button"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            haptic("heavy");
            onComplete();
          }
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          max.current = (track.current?.clientWidth ?? 300) - 64;
          x0.current = e.clientX - x;
          quarter.current = 0;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          haptic("light");
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const next = Math.max(0, Math.min(max.current, e.clientX - x0.current));
          setX(next);
          const q = Math.floor((next / max.current) * 4);
          if (q !== quarter.current) {
            quarter.current = q;
            haptic("select");
          }
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          if (x >= max.current - 4) {
            haptic("heavy");
            onComplete();
          }
          setX(0);
        }}
        onPointerCancel={() => {
          setDragging(false);
          setX(0);
        }}
      >
        <ArrowRight size={24} weight="bold" />
      </div>
    </div>
  );
}
