"use client";

import { useState } from "react";
import { CaretDown, Phone, WarningCircle, WhatsappLogo } from "@phosphor-icons/react/ssr";

import {
  telHref,
  whatsappContactHref,
  type ProgressStep,
  type ShipmentProgress,
} from "@/features/shipments/stages";
import { formatGhanaPhone } from "@/features/order-delivery/schema";
import { formatEventStamp, formatWeekdayDay } from "../format";

export interface JourneyProgressCardProps {
  progress: ShipmentProgress;
  orderNo: string;
  /** Tomame's own WhatsApp, for a step nobody has set a contact on. */
  fallbackWhatsappHref: string | null;
}

/**
 * "Progress timeline" (098): every step from payment to the door, as
 * done / current / next, with who to call about the current one and any delay
 * staff have posted.
 *
 * Folded by default to the last finished step, the current one and the next:
 * that is the question a customer opens the page with. The rest is one tap away.
 */
export function JourneyProgressCard({ progress, orderNo, fallbackWhatsappHref }: JourneyProgressCardProps) {
  const [expanded, setExpanded] = useState(false);
  if (progress.isCancelled || !progress.current) return null;

  const currentIndex = progress.steps.findIndex((s) => s.state === "current");
  const anchor = currentIndex === -1 ? progress.steps.length - 1 : currentIndex;
  const from = Math.max(0, anchor - 1);
  const to = Math.min(progress.steps.length, anchor + 2);
  const visible = expanded ? progress.steps : progress.steps.slice(from, to);
  const hidden = progress.steps.length - visible.length;

  return (
    <section className="tm-up flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.06s] [animation-duration:0.5s]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg leading-none font-bold">Progress</h2>
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-[13px] leading-none font-semibold text-tm-text-2 hover:text-tm-ink"
          >
            {expanded ? "Show less" : "All steps"}
            <CaretDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>

      <ol className="flex flex-col">
        {visible.map((step, index) => (
          <Step
            key={step.key}
            step={step}
            last={index === visible.length - 1}
            notice={step.state === "current" ? progress.notice : null}
            orderNo={orderNo}
            fallbackWhatsappHref={fallbackWhatsappHref}
          />
        ))}
      </ol>
    </section>
  );
}

const STATE_COPY = {
  done: { label: "Done", text: "text-tm-green-ink" },
  current: { label: "Current", text: "text-tm-coral-strong" },
  next: { label: "Next", text: "text-tm-text-3" },
} as const;

function Step({
  step,
  last,
  notice,
  orderNo,
  fallbackWhatsappHref,
}: {
  step: ProgressStep;
  last: boolean;
  notice: ShipmentProgress["notice"];
  orderNo: string;
  fallbackWhatsappHref: string | null;
}) {
  const copy = STATE_COPY[step.state];
  const stamp = formatEventStamp(step.at);
  const meta = [stamp, step.location].filter(Boolean).join(" · ");
  const contact = notice?.contact ?? step.contact;

  return (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`mt-[3px] shrink-0 rounded-full ${
            step.state === "done"
              ? "size-3 bg-tm-green"
              : step.state === "current"
                ? notice
                  ? "size-4 bg-tm-amber ring-4 ring-tm-amber-bg"
                  : "size-4 bg-tm-coral ring-4 ring-tm-tint"
                : "size-3 border-2 border-[#E5DBD3] bg-card"
          }`}
        />
        {!last && <span className="my-1.5 w-0.5 flex-1 bg-[#F5EEE9]" />}
      </div>

      <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
        <p className={`text-[11px] leading-none font-bold tracking-[0.08em] uppercase ${notice ? "text-[#8A5A0A]" : copy.text}`}>
          {notice ? "Delayed" : copy.label}
        </p>
        <p className={`mt-1.5 text-[15px] leading-[1.3] font-bold break-words ${step.state === "next" ? "text-tm-text-2" : ""}`}>
          {step.title}
        </p>
        {step.state !== "next" && (
          <p className="mt-1 text-[13px] leading-[1.45] text-tm-text-2">{step.description}</p>
        )}
        {meta && step.state !== "next" && (
          <p className="tm-nums mt-1 text-xs leading-[1.4] text-tm-text-3">{meta}</p>
        )}

        {notice && (
          <div className="mt-3 flex gap-2.5 rounded-[14px] bg-tm-amber-bg px-3.5 py-3 text-[13px] leading-[1.45] text-[#6B4708]">
            <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold break-words">{notice.message}</p>
              {notice.expectedOn && (
                <p className="mt-0.5">New estimate: {formatWeekdayDay(notice.expectedOn)}</p>
              )}
            </div>
          </div>
        )}

        {step.state === "current" && (
          <ContactRow contact={contact} orderNo={orderNo} stepTitle={step.title} fallbackWhatsappHref={fallbackWhatsappHref} />
        )}
      </div>
    </li>
  );
}

function ContactRow({
  contact,
  orderNo,
  stepTitle,
  fallbackWhatsappHref,
}: {
  contact: ProgressStep["contact"];
  orderNo: string;
  stepTitle: string;
  fallbackWhatsappHref: string | null;
}) {
  const text = `Hi, I'm following up on order ${orderNo} (${stepTitle}).`;
  if (!contact) {
    if (!fallbackWhatsappHref) return null;
    const href = `${fallbackWhatsappHref}${fallbackWhatsappHref.includes("?") ? "&" : "?"}text=${encodeURIComponent(text)}`;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-tm-text-2">Questions about this step?</span>
        <a href={href} target="_blank" rel="noreferrer" className={PILL}>
          <WhatsappLogo weight="fill" className="size-4 text-[#25D366]" aria-hidden />
          Message us
        </a>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-[14px] border border-tm-border px-3.5 py-3">
      <p className="text-[13px] leading-[1.4] text-tm-text-2">
        Questions about this step?{" "}
        <span className="font-semibold text-tm-ink">{contact.name ?? "Call us"}</span>
        {contact.hours ? <span className="text-tm-text-3"> · {contact.hours}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={telHref(contact.phone)} className={PILL}>
          <Phone weight="fill" className="size-4 text-tm-coral" aria-hidden />
          <span className="tm-nums">{formatGhanaPhone(contact.phone)}</span>
        </a>
        {contact.whatsapp && (
          <a href={whatsappContactHref(contact.phone, text)} target="_blank" rel="noreferrer" className={PILL}>
            <WhatsappLogo weight="fill" className="size-4 text-[#25D366]" aria-hidden />
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

const PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-3.5 text-[13px] leading-none font-semibold text-tm-ink hover:bg-tm-paper";
