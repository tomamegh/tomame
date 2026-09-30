"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BikeIcon, PhoneIcon, SendIcon } from "lucide-react";

import { AdminBadge, AdminButton, AdminCard, AdminConfirm } from "@/components/layout/admin";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { COURIER_NAME_MAX, formatGhanaPhone } from "../schema";
import type { AdminOrderCourier, CourierDispatchResult } from "../types";
import { describeCourierPreview, providerName } from "./courier-format";

/**
 * "Delivery rider" — the last-mile hand-off on `/admin/orders/[id]`.
 *
 * The admin types who has the parcel (a phone number, a ride-hailing tracking
 * link, or both) and sends it to the customer. It sits behind a confirmation
 * because it messages a real person: an email and a bell entry that cannot be
 * unsent.
 *
 * It decides nothing. `POST /api/admin/orders/:id/courier` validates the
 * number and the link, derives the provider from the host, refuses any order
 * that is not in transit and audits every send. The preview here uses the same
 * pure rules so what the admin reads is what the customer gets.
 */
export function AdminCourierPanel({
  orderId,
  status,
  courier,
  customerLabel,
  index = 0,
}: {
  orderId: string;
  status: string;
  courier: AdminOrderCourier | null;
  /** Who will receive it, named in the confirmation. */
  customerLabel: string | null;
  index?: number;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [name, setName] = useState(courier?.name ?? "");
  const [phone, setPhone] = useState(courier?.phone ? formatGhanaPhone(courier.phone) : "");
  const [trackingUrl, setTrackingUrl] = useState(courier?.trackingUrl ?? "");

  const preview = useMemo(
    () => describeCourierPreview({ name, phone, trackingUrl }),
    [name, phone, trackingUrl],
  );

  const editable = status === "in_transit";
  if (!editable && !courier) return null;

  const busy = sending || refreshing;
  const recipient = customerLabel ?? "The customer";

  async function send() {
    setSending(true);
    try {
      const { data: result } = await apiFetch<{ data: CourierDispatchResult }>(`/api/admin/orders/${orderId}/courier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courier_name: name,
          courier_phone: phone,
          tracking_url: trackingUrl,
        }),
      });
      if (result.action === "duplicate") {
        toast.success({
          title: "Already sent",
          description: "These exact details reached the customer a moment ago. Nothing was re-sent.",
        });
      } else if (result.notification === "notified") {
        toast.success({ title: "Customer notified", description: `${recipient} has the rider's details.` });
      } else {
        toast.error({
          title: "Saved, but the email did not go",
          description:
            "The rider is on the order and in the customer's app notifications. Check the notifications log.",
        });
      }
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error({
        title: "Could not send the rider's details",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminCard
      title="Delivery rider"
      blurb={
        editable
          ? "Who is bringing the parcel to the door. Add the rider's number, a ride-hailing tracking link (Uber, Yango, Bolt), or both, and we tell the customer."
          : "The rider who carried this order. It is no longer in transit, so nothing more can be sent."
      }
      action={
        courier ? (
          <AdminBadge tone="green">Rider sent</AdminBadge>
        ) : (
          <AdminBadge tone="amber">No rider yet</AdminBadge>
        )
      }
      index={index}
    >
      <div className="flex flex-col gap-4">
        {editable ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rider's name (optional)" id={`courier-name-${orderId}`}>
                <input
                  id={`courier-name-${orderId}`}
                  value={name}
                  maxLength={COURIER_NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Kofi"
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
              <Field label="Rider's phone" id={`courier-phone-${orderId}`}>
                <input
                  id={`courier-phone-${orderId}`}
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="024 412 3456"
                  autoComplete="off"
                  className={cn(INPUT, "tm-nums")}
                />
              </Field>
              <Field
                label="Tracking link (optional when there is a phone)"
                id={`courier-url-${orderId}`}
                className="sm:col-span-2"
              >
                <input
                  id={`courier-url-${orderId}`}
                  value={trackingUrl}
                  inputMode="url"
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://yango.com/..."
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
            </div>

            <div className="rounded-[14px] border border-tm-hairline bg-tm-paper p-4">
              <p className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
                The customer will read
              </p>
              <p className="mt-2 text-[13px] leading-[1.55] font-medium text-tm-ink">{preview.line}</p>
              {preview.problem ? (
                <p className="mt-2 text-[12.5px] leading-[1.5] font-semibold text-tm-coral-strong">
                  {preview.problem}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AdminButton
                variant="primary"
                disabled={Boolean(preview.problem)}
                busy={busy}
                onClick={() => setConfirming(true)}
              >
                <SendIcon className="size-3.5" aria-hidden />
                {courier ? "Save and notify again" : "Save and notify customer"}
              </AdminButton>
            </div>
          </>
        ) : null}

        {courier ? <LastSent courier={courier} /> : null}
      </div>

      <AdminConfirm
        open={confirming}
        onOpenChange={(next) => !busy && setConfirming(next)}
        title={courier ? "Send the updated rider details?" : "Tell the customer a rider has their package?"}
        consequence={`${recipient} will get an email and an app notification now. It cannot be unsent. The order stays in transit; mark it delivered separately when it arrives.`}
        detail={preview.line}
        confirmLabel="Send it"
        onConfirm={() => void send()}
        busy={busy}
      />
    </AdminCard>
  );
}

function LastSent({ courier }: { courier: AdminOrderCourier }) {
  const via = providerName(courier.provider);
  const when = formatAdminDateTime(courier.lastNotifiedAt);
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-tm-hairline p-4">
      <p className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
        Last sent
      </p>
      <p className="text-[13px] leading-[1.5] font-medium text-tm-ink">
        {when ? (
          <>
            <span className="tm-nums">{when}</span>
            {courier.dispatchedByName ? <> by {courier.dispatchedByName}</> : null}
          </>
        ) : (
          "Saved, but the customer has not been notified"
        )}
      </p>
      <ul className="flex flex-col gap-1 text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
        <li className="flex items-center gap-1.5">
          <BikeIcon className="size-3.5 shrink-0" aria-hidden />
          {courier.name ?? "Rider not named"}
        </li>
        {courier.phone ? (
          <li className="flex items-center gap-1.5">
            <PhoneIcon className="size-3.5 shrink-0" aria-hidden />
            <a href={`tel:${courier.phone}`} className="tm-nums hover:text-tm-ink hover:underline">
              {formatGhanaPhone(courier.phone)}
            </a>
          </li>
        ) : null}
        {courier.trackingUrl ? (
          <li className="min-w-0">
            <a
              href={courier.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-semibold text-tm-coral-strong hover:underline"
            >
              {via ? `${via} tracking link` : "Tracking link"}
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

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
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[12px] leading-none font-semibold text-tm-text-2">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink placeholder:text-tm-text-3 focus:border-tm-coral/40 focus:outline-none disabled:opacity-60";
