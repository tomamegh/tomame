"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminButton, AdminConfirm, AdminInput } from "@/components/layout/admin";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

import { departureLine } from "./box-departure";

/**
 * The flights ahead, and the two things ops can do to one (124): move it, or
 * cancel it. Either way its boxes follow, every order whose door date changes
 * gets the new date, and each of those customers is told once.
 */

export interface AdminDeparture {
  id: string;
  carrier: string;
  origin: string;
  destination: string;
  departs_at: string;
  cutoff_at: string;
  status: "scheduled" | "closed" | "departed" | "cancelled";
}

interface ChangeResult {
  departure: { departs_at: string } | null;
  redated: number;
  notified: number;
}

/** "Wed 26 Nov, 14:30" in Accra (UTC). */
function when(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${d.toISOString().slice(11, 16)}`;
}

function told(result: ChangeResult): string {
  if (result.redated === 0) return "No order's delivery date changed.";
  const orders = `${result.redated} ${result.redated === 1 ? "order has" : "orders have"} a new delivery date`;
  return `${orders}; ${result.notified} ${result.notified === 1 ? "customer" : "customers"} told.`;
}

export function AdminDepartures({ departures }: { departures: AdminDeparture[] }) {
  if (departures.length === 0) {
    return <p className="text-[13px] font-medium text-tm-text-2">No flight is scheduled. The schedule job adds them three weeks ahead.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-tm-hairline">
      {departures.map((d) => (
        <DepartureRow key={d.id} departure={d} />
      ))}
    </ul>
  );
}

function DepartureRow({ departure: d }: { departure: AdminDeparture }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(d.departs_at.slice(0, 10));
  const [time, setTime] = useState(d.departs_at.slice(11, 16));
  const [busy, setBusy] = useState<"move" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = async (kind: "move" | "cancel") => {
    setBusy(kind);
    try {
      const res = await apiFetch<{ data: ChangeResult }>(`/api/admin/departures/${d.id}/${kind}`, {
        method: "POST",
        ...(kind === "move" && { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, time }) }),
      });
      const r = res.data;
      toast.success({
        title: kind === "move" ? `Flight moved to ${r.departure ? when(r.departure.departs_at) : "the new day"}` : "Flight cancelled",
        description: kind === "cancel" && !r.departure ? `No later flight is scheduled yet. ${told(r)}` : told(r),
      });
      setEditing(false);
      setConfirmCancel(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: kind === "move" ? "Couldn't move the flight" : "Couldn't cancel the flight", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0" data-testid="admin-departure">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-tm-ink">{departureLine(d)}</p>
          <p className="text-[12px] font-medium text-tm-text-2">
            Leaves {when(d.departs_at)} · cutoff {when(d.cutoff_at)} (Accra time)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AdminBadge tone={d.status === "scheduled" ? "green" : "amber"}>{d.status === "scheduled" ? "Taking boxes" : "Past cutoff"}</AdminBadge>
          {!editing && (
            <>
              <AdminButton onClick={() => setEditing(true)} disabled={busy !== null}>Move</AdminButton>
              <AdminButton variant="danger" onClick={() => setConfirmCancel(true)} disabled={busy !== null}>Cancel flight</AdminButton>
            </>
          )}
        </div>
      </div>

      {editing && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-[14px] bg-tm-paper p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("move");
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-tm-text-2">
            New day
            <AdminInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-tm-text-2">
            Leaves at (Accra)
            <AdminInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <AdminButton type="submit" variant="primary" busy={busy === "move"}>Move flight</AdminButton>
          <AdminButton variant="quiet" onClick={() => setEditing(false)} disabled={busy !== null}>Keep it</AdminButton>
          <p className="basis-full text-[12px] font-medium text-tm-text-2">
            The cutoff moves with it. Boxes on this flight follow, and customers whose delivery date changes get one message.
          </p>
        </form>
      )}

      <AdminConfirm
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this flight?"
        consequence="Its boxes and packages move to the next scheduled flight. Customers whose delivery date changes get one message with the new date."
        detail={departureLine(d)}
        confirmLabel="Cancel the flight"
        cancelLabel="Keep the flight"
        onConfirm={() => void run("cancel")}
        busy={busy === "cancel"}
      />
    </li>
  );
}
