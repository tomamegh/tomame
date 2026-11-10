"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  CameraIcon,
  CarFrontIcon,
  CheckCircle2Icon,
  CheckIcon,
  LockIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  StickyNoteIcon,
} from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { recipientLines } from "@/features/warehouse/components/format";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { DriverBoard, DriverDrop } from "../types";

/**
 * A driver's day (102), one card per stop, top to bottom in the order they
 * were given: who, where, what, then the two things that make it "delivered":
 * a photo of the hand-over and the code the customer reads out.
 *
 * Built for one hand at a door: big buttons, the camera opens straight from
 * "Take photo", the code box brings up the number pad, and nothing is a link
 * the driver might tap by accident.
 */
export function DeliveriesBoard({ board, firstName }: { board: DriverBoard; firstName: string | null }) {
  const parcels = board.drops.reduce((n, d) => n + d.parcels.length, 0);
  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex flex-col gap-1">
        <span className="text-[11px] font-bold tracking-[0.16em] text-tm-coral-strong uppercase">
          {board.is_staff ? "Every driver" : firstName ? `Hi, ${firstName}` : "Today"}
        </span>
        <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em] text-tm-ink">
          {board.is_staff ? "Deliveries" : "My deliveries"}
        </h1>
        <p className="text-[13px] font-medium text-tm-text-2">
          {board.drops.length === 0
            ? "Nothing to deliver right now."
            : `${board.drops.length} ${board.drops.length === 1 ? "stop" : "stops"} · ${parcels} ${parcels === 1 ? "parcel" : "parcels"}. At each door: take a photo, ask for their code, confirm.`}
        </p>
      </header>

      {board.drops.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-tm-border bg-card px-6 py-12 text-center">
          <CarFrontIcon className="size-8 text-tm-text-3" aria-hidden />
          <p className="font-display text-[17px] font-bold text-tm-ink">No deliveries assigned</p>
          <p className="max-w-[40ch] text-[13px] font-medium text-tm-text-2">
            When the warehouse gives you parcels to take out, they show up here with the address and the customer&apos;s number.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {board.drops.map((drop, i) => (
            <DropCard key={drop.key} drop={drop} index={i} />
          ))}
        </ol>
      )}

      {board.done_today.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[12px] font-bold tracking-[0.12em] text-tm-text-3 uppercase">Delivered today</h2>
          <ul className="divide-y divide-tm-hairline overflow-hidden rounded-[18px] border border-tm-border bg-card">
            {board.done_today.map((d) => (
              <li key={d.order_id} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2Icon className="size-5 shrink-0 text-tm-green" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tm-ink">{d.title}</span>
                <span className="shrink-0 text-[12px] font-medium text-tm-text-3">{d.recipient_name ?? d.order_no}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DropCard({ drop, index }: { drop: DriverDrop; index: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState(drop.photo_count);
  const [preview, setPreview] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const r = drop.recipient;
  const lines = recipientLines(r);
  const digits = code.replace(/\D/g, "");
  const query = [r.line1, r.area, r.city, "Ghana"].filter(Boolean).join(", ") || r.digital_address || r.zone_name || "";
  const mapsHref = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  const notes = drop.parcels.map((p) => p.special_instructions).filter((n): n is string => !!n);

  const onPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setPreview(URL.createObjectURL(files[0]!));
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of files) form.append("file", f);
      await apiFetch(`/api/driver/deliveries/${drop.parcels[0]!.order_id}/photos`, { method: "POST", body: form });
      setPhotos((n) => n + files.length);
      toast.success({ title: "Photo saved", description: "Now ask for their delivery code." });
    } catch (error) {
      setPreview(null);
      toast.error({ title: "The photo didn't upload", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setUploading(false);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/driver/deliveries/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: drop.parcels.map((p) => p.order_id), code: digits }),
      });
      toast.success({ title: `Delivered to ${r.name ?? "the customer"}`, description: "They've been told. On to the next stop." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Not confirmed", description: error instanceof Error ? error.message : "Try again." });
      setCode("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col overflow-hidden rounded-[22px] border border-tm-border bg-card">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="tm-nums flex size-8 shrink-0 items-center justify-center rounded-full bg-tm-ink text-[13px] font-bold text-white">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[19px] leading-tight font-bold break-words text-tm-ink">{r.name ?? "Customer"}</p>
            {drop.driver_name ? <p className="text-[12px] font-semibold text-tm-text-3">With {drop.driver_name}</p> : null}
            {lines.map((line) => (
              <p key={line} className="flex items-start gap-1.5 text-[13.5px] leading-[1.4] font-medium text-tm-text-2">
                <MapPinIcon className="mt-[3px] size-3.5 shrink-0 text-tm-text-3" aria-hidden />
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {r.phone ? (
            <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className={BIG_BUTTON}>
              <PhoneIcon className="size-4" aria-hidden />
              Call
            </a>
          ) : (
            <span className={cn(BIG_BUTTON, "opacity-40")}>No phone</span>
          )}
          {mapsHref ? (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={BIG_BUTTON}>
              <NavigationIcon className="size-4" aria-hidden />
              Directions
            </a>
          ) : (
            <span className={cn(BIG_BUTTON, "opacity-40")}>No address</span>
          )}
        </div>

        <ul className="flex flex-col gap-2 rounded-[16px] bg-tm-paper p-2.5">
          {drop.parcels.map((p) => (
            <li key={p.order_id} className="flex items-center gap-2.5">
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-tm-hairline bg-white">
                {p.image_url ? (
                  <img src={p.image_url} alt="" referrerPolicy="no-referrer" className="size-full object-contain p-1" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-tm-ink">{p.title}</span>
                <span className="text-[12px] font-medium text-tm-text-3">
                  <span className="font-mono">{p.order_no}</span> · Qty {p.quantity}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {notes.length > 0 && (
          <p className="flex gap-2 rounded-[14px] bg-tm-amber-bg px-3 py-2.5 text-[13px] font-medium text-[#6B4708]">
            <StickyNoteIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notes.join(" · ")}
          </p>
        )}
      </div>

      {drop.locked ? (
        <div className="flex items-center gap-2 border-t border-tm-hairline bg-tm-pill-bg px-4 py-3.5 text-[13px] font-semibold text-tm-coral-strong">
          <LockIcon className="size-4 shrink-0" aria-hidden />
          Too many wrong codes. Call the office to confirm this delivery.
        </div>
      ) : (
        <form onSubmit={confirm} className="flex flex-col gap-3 border-t border-tm-hairline bg-tm-paper/60 p-4">
          <div className="flex items-center gap-3">
            <Step n={1} done={photos > 0} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-tm-ink">Photo of the hand-over</p>
              <p className="text-[12px] font-medium text-tm-text-3">
                {photos > 0 ? `${photos} saved` : "The parcel with the customer, or at their door."}
              </p>
            </div>
            {preview ? <img src={preview} alt="" className="size-11 shrink-0 rounded-[10px] object-cover" /> : null}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
            <AdminButton
              type="button"
              variant={photos > 0 ? "secondary" : "primary"}
              className="h-11 px-4"
              busy={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <CameraIcon className="size-4" aria-hidden />
              {photos > 0 ? "Another" : "Take photo"}
            </AdminButton>
          </div>

          <div className="flex items-center gap-3">
            <Step n={2} done={digits.length === 6} />
            <label className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-tm-ink">Their delivery code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000 000"
                aria-label={`Delivery code for ${r.name ?? "this customer"}`}
                className="tm-nums mt-1 h-12 w-full rounded-[12px] border border-tm-border bg-card px-3 text-center font-mono text-[22px] font-bold tracking-[0.3em] text-tm-ink outline-none placeholder:text-tm-text-3/50 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
              />
            </label>
          </div>

          <AdminButton
            type="submit"
            variant="primary"
            className="h-12 w-full text-[15px]"
            busy={busy}
            disabled={photos === 0 || digits.length !== 6}
          >
            <CheckIcon className="size-5" aria-hidden />
            Confirm delivered
          </AdminButton>
          {photos === 0 ? (
            <p className="text-center text-[12px] font-medium text-tm-text-3">Take the photo first, then the code.</p>
          ) : null}
        </form>
      )}
    </li>
  );
}

function Step({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
        done ? "bg-tm-green text-white" : "border-2 border-tm-border bg-card text-tm-text-3",
      )}
    >
      {done ? <CheckIcon className="size-4 stroke-[3]" /> : n}
    </span>
  );
}

const BIG_BUTTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-tm-border bg-card px-3 text-[14px] font-semibold text-tm-ink active:bg-tm-paper";
