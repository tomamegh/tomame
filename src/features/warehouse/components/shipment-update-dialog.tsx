"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellIcon, BikeIcon, ClockAlertIcon, PhoneIcon, RouteIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MOVABLE_STAGES,
  STAGE_DEFAULT_LOCATION,
  type MovableStage,
  type ShipmentStageKey,
  type StageSetting,
} from "@/features/shipments/stages";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { errorText, warehouseRequest } from "./warehouse-actions";

/**
 * One dialog for every shipment update (098): move what is selected to a step,
 * post a delay notice, or take one down. Whatever is selected — one package,
 * six packages off the same flight, a handful of loose orders — moves together,
 * and the result names any order that could not.
 */

export type ShipmentUpdateMode = "move" | "delay" | "clear";

export interface ShipmentTargets {
  package_ids: string[];
  order_ids: string[];
  /** For the heading: "3 packages · 14 orders · 9 customers". */
  summary: string;
}

interface MoveResult {
  moved: number;
  skipped: Array<{ order_no: string; reason: string }>;
  failed: Array<{ order_no: string; reason: string }>;
}

const FIELD =
  "h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60";

export function ShipmentUpdateDialog({
  open,
  onOpenChange,
  mode,
  targets,
  settings,
  suggestedStage,
  onDone,
  drivers = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ShipmentUpdateMode;
  targets: ShipmentTargets;
  settings: Record<ShipmentStageKey, StageSetting>;
  suggestedStage: MovableStage | null;
  onDone?: () => void;
  /** 102: our drivers, offered on Out for delivery. */
  drivers?: Array<{ id: string; name: string; phone: string | null }>;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<MovableStage>(suggestedStage ?? "arrived_country");
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const [when, setWhen] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [rideLink, setRideLink] = useState("");
  const [driverId, setDriverId] = useState<string>("");
  const [riderKind, setRiderKind] = useState<"driver" | "other">("driver");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = suggestedStage ?? "arrived_country";
    setStage(next);
    setMessage("");
    setLocation(STAGE_DEFAULT_LOCATION[next] ?? "");
    setWhen("");
    setExpectedOn("");
    setContactName("");
    setContactPhone("");
    setRideLink("");
    setDriverId("");
    setRiderKind(drivers.length > 0 ? "driver" : "other");
    setNotify(true);
  }, [open, suggestedStage, drivers.length]);

  const setting = mode === "move" ? settings[stage] : null;
  const riderStep = mode === "move" && stage === "out_for_delivery";
  const fallbackContact = setting?.contact_phone
    ? `${setting.contact_name ? `${setting.contact_name} · ` : ""}${setting.contact_phone}`
    : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      // 101: on Out for delivery the box names the rider, who goes through the
      // same hand-off as the admin page (rider card, email, WhatsApp).
      const useDriver = riderStep && riderKind === "driver" && !!driverId;
      const withRider = riderStep && !useDriver && riderKind === "other" && (contactPhone.trim() || rideLink.trim());
      const common = {
        package_ids: targets.package_ids,
        order_ids: targets.order_ids,
        contact_name: withRider || useDriver ? null : contactName.trim() || null,
        contact_phone: withRider || useDriver ? null : contactPhone.trim() || null,
        notify,
      };
      const result =
        mode === "move"
          ? await warehouseRequest<MoveResult>("/api/warehouse/shipments/stage", "POST", {
              ...common,
              stage,
              message: message.trim() || null,
              location: location.trim() || null,
              occurred_at: when ? new Date(when).toISOString() : null,
              rider: withRider
                ? { courier_name: contactName, courier_phone: contactPhone, tracking_url: rideLink }
                : null,
              driver_id: useDriver ? driverId : null,
            })
          : await warehouseRequest<MoveResult>("/api/warehouse/shipments/notice", "POST", {
              ...common,
              clear: mode === "clear",
              message: message.trim() || null,
              expected_on: mode === "delay" ? expectedOn || null : null,
            });

      const problems = [...result.failed, ...result.skipped];
      const title =
        mode === "move"
          ? `${result.moved} order${result.moved === 1 ? "" : "s"} moved to ${settings[stage].title}`
          : mode === "delay"
            ? `Delay posted on ${result.moved} order${result.moved === 1 ? "" : "s"}`
            : `Delay cleared on ${result.moved} order${result.moved === 1 ? "" : "s"}`;
      const description = problems.length
        ? problems.slice(0, 4).map((p) => `${p.order_no}: ${p.reason}`).join(" · ") +
          (problems.length > 4 ? ` · and ${problems.length - 4} more` : "")
        : notify && mode !== "clear"
          ? "Customers have been told."
          : undefined;
      if (result.failed.length > 0) toast.error({ title, description });
      else toast.success({ title, description });
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not save the update", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === "move" ? "Move to the next step" : mode === "delay" ? "Post a delay notice" : "Clear the delay";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[520px]">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-[20px] font-bold text-tm-ink">
              {mode === "move" ? (
                <RouteIcon className="size-5 text-tm-coral" aria-hidden />
              ) : (
                <ClockAlertIcon className="size-5 text-tm-amber" aria-hidden />
              )}
              {heading}
            </DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-tm-text-2">{targets.summary}</DialogDescription>
          </DialogHeader>

          {mode === "move" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-tm-ink">Step</legend>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                {MOVABLE_STAGES.map((key) => (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-[14px] border px-3 py-2.5 transition-colors",
                      stage === key ? "border-tm-coral bg-tm-tint" : "border-tm-border bg-card hover:border-tm-coral/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="stage"
                      value={key}
                      checked={stage === key}
                      onChange={() => {
                        setStage(key);
                        setLocation(STAGE_DEFAULT_LOCATION[key] ?? "");
                      }}
                      className="sr-only"
                    />
                    <span className="text-[13.5px] font-semibold text-tm-ink">{settings[key].title}</span>
                    <span className="line-clamp-2 text-[12px] font-medium text-tm-text-3">{settings[key].description}</span>
                  </label>
                ))}
              </div>
              {stage === "delivered" && (
                <p className="text-[12px] font-medium text-tm-text-3">
                  Marks every order delivered. Customers get the delivered email; this cannot be undone here.
                </p>
              )}
            </fieldset>
          )}

          {mode !== "clear" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-tm-ink">
                {mode === "delay" ? "What is causing the delay" : "Note for customers"}
                {mode === "move" && <span className="font-medium text-tm-text-3"> (optional)</span>}
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={mode === "delay" ? 500 : 300}
                rows={3}
                required={mode === "delay"}
                autoFocus={mode === "delay"}
                placeholder={
                  mode === "delay"
                    ? "e.g. Customs is inspecting this consignment. It should clear in 2 working days."
                    : setting?.description
                }
                className="rounded-[12px] border border-tm-border bg-card px-3 py-2.5 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
              />
            </label>
          )}

          {mode === "move" && stage !== "delivered" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-tm-ink">Where</span>
                <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} className={FIELD} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-tm-ink">When (if not now)</span>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={FIELD} />
              </label>
            </div>
          )}

          {mode === "delay" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-tm-ink">New estimate (optional)</span>
              <input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} className={FIELD} />
            </label>
          )}

          {riderStep && drivers.length > 0 && (
            <div className="flex flex-col gap-2 rounded-[16px] bg-tm-paper p-3">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-tm-ink">
                <BikeIcon className="size-3.5" aria-hidden />
                Who is taking them
              </span>
              <div className="grid grid-cols-2 gap-1 rounded-[12px] border border-tm-border bg-card p-1">
                {(["driver", "other"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRiderKind(k)}
                    aria-pressed={riderKind === k}
                    className={cn(
                      "h-9 rounded-[9px] text-[13px] font-semibold",
                      riderKind === k ? "bg-tm-ink text-white" : "text-tm-text-2 hover:bg-tm-paper",
                    )}
                  >
                    {k === "driver" ? "Our driver" : "Another rider"}
                  </button>
                ))}
              </div>
              {riderKind === "driver" && (
                <>
                  <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={FIELD} aria-label="Driver">
                    <option value="">Choose a driver…</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id} disabled={!d.phone}>
                        {d.name}
                        {d.phone ? "" : " (no phone on profile)"}
                      </option>
                    ))}
                  </select>
                  <span className="text-[12px] font-medium text-tm-text-3">
                    The parcels appear in their app. Customers get the driver&apos;s name and number, and a code to give them at the door.
                  </span>
                </>
              )}
            </div>
          )}

          {mode !== "clear" && !(mode === "move" && stage === "delivered") && !(riderStep && drivers.length > 0 && riderKind === "driver") && (
            <div className="flex flex-col gap-2 rounded-[16px] bg-tm-paper p-3">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-tm-ink">
                {riderStep ? <BikeIcon className="size-3.5" aria-hidden /> : <PhoneIcon className="size-3.5" aria-hidden />}
                {riderStep ? "The rider taking them" : "Who customers should call"}
              </span>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  maxLength={80}
                  placeholder={riderStep ? "Rider's name, e.g. Kofi" : "Name, e.g. Ama (customs desk)"}
                  className={FIELD}
                />
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  inputMode="tel"
                  maxLength={30}
                  placeholder="024 412 3456"
                  className={FIELD}
                />
              </div>
              {riderStep && (
                <input
                  value={rideLink}
                  onChange={(e) => setRideLink(e.target.value)}
                  inputMode="url"
                  maxLength={2048}
                  placeholder="Uber / Bolt / Yango trip link (optional)"
                  className={FIELD}
                />
              )}
              <span className="text-[12px] font-medium text-tm-text-3">
                {riderStep
                  ? "Customers get the rider's name, a call button and the live trip. One message each, however many of their orders the rider has."
                  : fallbackContact
                    ? `Leave blank to use this step's usual contact: ${fallbackContact}.`
                    : "Leave blank and customers are offered Tomame's WhatsApp."}
              </span>
            </div>
          )}

          {mode !== "clear" && !(mode === "move" && stage === "delivered") && (
            <label className="flex items-center gap-2 text-[13px] font-medium text-tm-text-2">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-tm-coral" />
              <BellIcon className="size-3.5" aria-hidden />
              Email and message customers about this
            </label>
          )}

          <DialogFooter>
            <AdminButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" variant="primary" busy={busy}>
              {mode === "move" ? `Move to ${settings[stage].title}` : mode === "delay" ? "Post delay" : "Clear delay"}
            </AdminButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
