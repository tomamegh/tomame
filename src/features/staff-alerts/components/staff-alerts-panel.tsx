"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneTilt, Plus, X } from "@phosphor-icons/react/ssr";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminTableScroller,
  type AdminTone,
} from "@/components/layout/admin";
import type { StaffAlertSendRow } from "@/db/queries/staff-alerts";
import { formatRelativeTime } from "@/features/app-home/components/format";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { STAFF_ALERT_EVENTS, STAFF_EVENT_LABELS, type StaffEventToggles } from "../settings";

export interface StaffAlertsPanelProps {
  recipients: string[];
  recipientsFrom: "env" | "setting" | "default";
  events: StaffEventToggles;
  enabled: boolean;
  environment: string | null;
  recentSends: StaffAlertSendRow[];
  renderedAt: string;
  index?: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX = 20;

const STATUS_TONE: Record<StaffAlertSendRow["status"], AdminTone> = {
  sent: "green",
  failed: "coral",
  pending: "amber",
  skipped: "muted",
};

/**
 * "Staff notifications" on /admin/notifications (087): who is emailed about
 * orders and payments, which events, and a test send. Saves through
 * /api/admin/staff-alerts, which validates and audits again.
 */
export function StaffAlertsPanel(props: StaffAlertsPanelProps) {
  const router = useRouter();
  const [recipients, setRecipients] = useState(props.recipients);
  const [events, setEvents] = useState(props.events);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const now = new Date(props.renderedAt);

  const dirty =
    JSON.stringify(recipients) !== JSON.stringify(props.recipients) || JSON.stringify(events) !== JSON.stringify(props.events);

  function add() {
    const value = draft.trim().toLowerCase();
    if (!EMAIL.test(value)) return setDraftError("Enter a valid email address");
    if (recipients.includes(value)) return setDraftError("Already on the list");
    if (recipients.length >= MAX) return setDraftError(`At most ${MAX} addresses`);
    setRecipients([...recipients, value]);
    setDraft("");
    setDraftError(null);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/admin/staff-alerts", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipients, events }),
      });
      toast.success({ title: "Staff notifications saved", description: `${recipients.length} address${recipients.length === 1 ? "" : "es"}.` });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Not saved", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await apiFetch("/api/admin/staff-alerts/test", { method: "POST" });
      toast.success({ title: "Test email sent", description: "To every address on the saved list." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Test email not sent", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AdminCard
      index={props.index}
      title="Staff notifications"
      blurb="Who is emailed when a customer places an order, pays, or an order moves. One email per event per order."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton onClick={sendTest} busy={testing} disabled={dirty} title={dirty ? "Save first: the test goes to the saved list" : undefined}>
            <PaperPlaneTilt size={14} weight="bold" />
            Send test
          </AdminButton>
          <AdminButton variant="primary" onClick={save} busy={saving} disabled={!dirty || recipients.length === 0}>
            Save
          </AdminButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!props.enabled ? (
          <p role="status" className="rounded-[14px] bg-tm-paper px-4 py-3 text-[13px] leading-[1.5] font-medium text-tm-text-2">
            <span className="font-semibold text-tm-ink">Not sending on {props.environment ?? "this deployment"}.</span> Events are
            recorded below as skipped. Only production (tomame.ca) emails the list, unless OPS_ALERTS_ENABLED=true. The test
            button is off here too, unless STAFF_ALERT_RECIPIENTS points it at a test address.
          </p>
        ) : null}
        {props.recipientsFrom === "env" ? (
          <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.5] font-medium text-[#7a4a06]">
            STAFF_ALERT_RECIPIENTS is set on this deployment, so it replaces the saved list below.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <h3 className="text-[12px] leading-none font-bold text-tm-text-2">Recipients</h3>
          <ul className="flex flex-wrap gap-2">
            {recipients.map((address) => (
              <li key={address} className="flex items-center gap-1 rounded-full bg-tm-paper py-1 pr-1 pl-3 text-[13px] font-semibold text-tm-ink">
                <span className="max-w-[260px] truncate">{address}</span>
                <button
                  type="button"
                  aria-label={`Remove ${address}`}
                  disabled={recipients.length === 1}
                  onClick={() => setRecipients(recipients.filter((r) => r !== address))}
                  className="grid size-6 place-items-center rounded-full text-tm-text-3 hover:bg-card hover:text-tm-coral-strong disabled:opacity-40"
                >
                  <X size={12} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <AdminInput
              type="email"
              aria-label="Add an email address"
              placeholder="name@example.com"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDraftError(null);
              }}
              className="w-[260px] max-w-full"
            />
            <AdminButton type="submit" disabled={!draft.trim()}>
              <Plus size={14} weight="bold" />
              Add
            </AdminButton>
            {draftError ? <span className="text-[12px] font-semibold text-tm-coral-strong">{draftError}</span> : null}
          </form>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[12px] leading-none font-bold text-tm-text-2">Events</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {STAFF_ALERT_EVENTS.map((event) => (
              <label key={event} className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-tm-paper px-4 py-3">
                <input
                  type="checkbox"
                  checked={events[event]}
                  onChange={(e) => setEvents({ ...events, [event]: e.target.checked })}
                  className="mt-0.5 size-4 accent-[#f25b3d]"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] leading-none font-semibold text-tm-ink">{STAFF_EVENT_LABELS[event].label}</span>
                  <span className="text-[12px] leading-[1.4] font-medium text-tm-text-3">{STAFF_EVENT_LABELS[event].detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {props.recentSends.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-[12px] leading-none font-bold text-tm-text-2">Recent staff emails</h3>
            <AdminTableScroller>
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr>
                    <th className={ADMIN_TH}>Subject</th>
                    <th className={ADMIN_TH}>Status</th>
                    <th className={ADMIN_TH}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {props.recentSends.map((row) => (
                    <tr key={row.id} className={ADMIN_TR}>
                      <td className={ADMIN_TD}>
                        <span className="block max-w-[420px] truncate" title={row.error ?? row.subject ?? row.event_key}>
                          {row.subject ?? row.event_key}
                        </span>
                      </td>
                      <td className={ADMIN_TD}>
                        <AdminBadge tone={STATUS_TONE[row.status]}>
                          {row.status}
                          {row.status === "sent" && row.failed_recipients > 0 ? `, ${row.failed_recipients} missed` : ""}
                        </AdminBadge>
                      </td>
                      <td className={ADMIN_TD}>{formatRelativeTime(row.created_at, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableScroller>
          </div>
        ) : null}
      </div>
    </AdminCard>
  );
}
