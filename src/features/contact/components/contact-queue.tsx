"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2Icon, MailIcon, UserIcon } from "lucide-react";

import { AdminBadge, AdminCard, AdminEmpty } from "@/components/layout/admin";
import type { ContactMessageRow, ContactMessageStatus } from "@/db/queries/contact-messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useContactQueue, useMoveContactMessage } from "../hooks/useContactQueue";
import {
  CONTACT_ACTION_LABELS,
  contactActionsFor,
  contactReplyHref,
  contactStatusLabel,
  contactStatusTone,
  describeContactWait,
  type ContactAction,
} from "./queue-format";

/**
 * `/admin/contact-messages` — everything sent through `/contact`.
 *
 * WHY THIS QUEUE EXISTS AT ALL. Until this session the contact form sent
 * nothing: it set a "Message sent!" state and threw the message away, while
 * telling the sender they would hear back within a few hours. Migration 053 gave
 * it a table; this is the other half of the promise.
 *
 * The sender is almost always signed out, so the email address they typed is the
 * ONLY route back to them — which is why replying is one click and why the draft
 * opens with their own message quoted underneath it.
 *
 * Same shape as the assisted queue on purpose: oldest first, a guarded
 * transition that surfaces its 409 rather than swallowing it, and a note that
 * travels with the move.
 */

const TABS: { key: ContactMessageStatus | "all"; label: string }[] = [
  { key: "open", label: "Unanswered" },
  { key: "answered", label: "Answered" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/** `listContactMessages` caps at 200; a full page is a page that is hiding rows. */
const PAGE_CAP = 200;

export function ContactQueue() {
  const [tab, setTab] = useState<ContactMessageStatus | "all">("open");
  const { data, isPending } = useContactQueue(tab);
  const move = useMoveContactMessage();
  const [movingId, setMovingId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const onMove = useCallback(
    (row: ContactMessageRow, to: ContactAction, note: string | null | undefined) => {
      setMovingId(row.id);
      move.mutate(
        { id: row.id, from: row.status, status: to, ...(note !== undefined && { note }) },
        {
          onSettled: () => setMovingId(null),
          onError: (error) => {
            if (error instanceof ApiFetchError && error.status === 409) {
              toast.info({
                title: "Someone else picked this one up",
                description: "The queue has been refreshed.",
              });
              return;
            }
            toast.error({ title: "Could not update that", description: error.message });
          },
        },
      );
    },
    [move],
  );

  const rows = data ?? [];
  const oldestWait = tab === "open" && rows[0] ? describeContactWait(rows[0].created_at, now) : null;

  return (
    <AdminCard
      title={TABS.find((t) => t.key === tab)?.label ?? "Messages"}
      blurb={
        oldestWait
          ? `Oldest first. The one at the top has been ${oldestWait.toLowerCase()} — the form promises a few hours.`
          : "Oldest first — the form tells every sender they will hear back within a few hours."
      }
      action={<QueueTabs value={tab} onChange={setTab} />}
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[16px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <AdminEmpty title={emptyTitle(tab)} body={emptyBody(tab)} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <ContactRow
                key={row.id}
                row={row}
                now={now}
                busy={movingId === row.id}
                onMove={(to, note) => onMove(row, to, note)}
              />
            ))}
          </ul>
          {rows.length >= PAGE_CAP ? (
            <p className="mt-4 text-[12px] leading-[1.4] font-medium text-tm-text-3">
              Showing the oldest <span className="tm-nums">{PAGE_CAP}</span>. Work these down and the
              rest will appear.
            </p>
          ) : null}
        </>
      )}
    </AdminCard>
  );
}

// ── One message ──────────────────────────────────────────────────────────────

function ContactRow({
  row,
  now,
  busy,
  onMove,
}: {
  row: ContactMessageRow;
  now: Date;
  busy: boolean;
  onMove: (to: ContactAction, note: string | null | undefined) => void;
}) {
  const [note, setNote] = useState(row.note ?? "");
  const actions = contactActionsFor(row.status);
  const reply = contactReplyHref(row);
  const wait = describeContactWait(row.created_at, now);

  /** Undefined means "leave the note alone" — an untouched box must not wipe one. */
  const notePayload = (): string | null | undefined => {
    const trimmed = note.trim();
    if (trimmed === (row.note ?? "")) return undefined;
    return trimmed.length > 0 ? trimmed : null;
  };

  return (
    <li className="flex flex-col gap-3 rounded-[16px] border border-tm-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={contactStatusTone(row.status)}>{contactStatusLabel(row.status)}</AdminBadge>
        {wait ? (
          <span className="text-[12px] leading-none font-semibold text-tm-text-3">{wait}</span>
        ) : null}
        {row.user_id ? (
          <span className="inline-flex items-center gap-1 text-[12px] leading-none font-medium text-tm-text-3">
            <UserIcon className="size-3.5" aria-hidden />
            has an account
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-[16px] leading-[1.25] font-bold text-tm-ink">{row.subject}</h3>
        <p className="text-[14px] leading-[1.6] whitespace-pre-wrap text-tm-text-2">{row.message}</p>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[1.4] font-medium text-tm-text-3">
        <span className="text-tm-text-2">{row.name}</span>
        <span>· {row.email}</span>
        <span className="tm-nums">
          · {new Date(row.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
        </span>
        {row.answered_at ? (
          <span className="tm-nums">
            · replied{" "}
            {new Date(row.answered_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
          </span>
        ) : null}
      </p>

      {actions.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] leading-none font-semibold text-tm-text-2">
              What you told them
            </span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Your own record of the reply. Saved with whichever button you press."
              className="min-h-[64px] resize-y rounded-[12px] border-tm-border bg-tm-paper text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {reply ? (
              <a
                href={reply}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tm-tint px-3.5 text-[13px] leading-none font-semibold text-tm-ink transition-opacity hover:opacity-85"
              >
                <MailIcon className="size-4" aria-hidden />
                Reply by email
              </a>
            ) : (
              <span className="text-[12px] leading-none font-medium text-tm-text-3">
                That address cannot be replied to — there is no other way back to this sender.
              </span>
            )}

            {actions.map((action) => (
              <Button
                key={action}
                size="sm"
                onClick={() => onMove(action, notePayload())}
                disabled={busy}
                aria-busy={busy}
                className={cn(
                  "rounded-full border-0",
                  action === "answered"
                    ? "tm-cta-gradient text-white hover:opacity-90"
                    : "bg-tm-paper text-tm-text-2 hover:bg-tm-tint hover:text-tm-ink",
                )}
              >
                {busy && action === "answered" ? (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                ) : null}
                {CONTACT_ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        </div>
      ) : row.note ? (
        <div className="rounded-[12px] bg-tm-paper px-3 py-2.5">
          <p className="text-[12px] leading-none font-semibold text-tm-text-3">What you told them</p>
          <p className="mt-1.5 text-[13px] leading-[1.5] whitespace-pre-wrap text-tm-text-2">{row.note}</p>
        </div>
      ) : null}
    </li>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function QueueTabs({
  value,
  onChange,
}: {
  value: ContactMessageStatus | "all";
  onChange: (tab: ContactMessageStatus | "all") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter the contact queue">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={value === t.key}
          className={cn(
            "h-8 rounded-full px-3.5 text-[13px] leading-none font-semibold transition-colors",
            value === t.key
              ? "bg-tm-ink text-white"
              : "bg-tm-paper text-tm-text-2 hover:bg-tm-tint hover:text-tm-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function emptyTitle(tab: ContactMessageStatus | "all"): string {
  if (tab === "open") return "Nobody is waiting for a reply";
  if (tab === "answered") return "Nothing answered yet";
  if (tab === "closed") return "Nothing closed yet";
  return "No messages yet";
}

function emptyBody(tab: ContactMessageStatus | "all"): string {
  if (tab === "open") {
    return "Every message sent through the contact form has been answered. New ones land here the moment somebody writes.";
  }
  if (tab === "answered") {
    return "No message has been marked replied. Mark one once you have written back, so the next person on shift does not write again.";
  }
  if (tab === "closed") {
    return "Nothing has been closed off. Closing is for messages that needed no reply, or where the conversation has ended.";
  }
  return "The contact form at /contact writes here. Nothing has been sent through it yet.";
}
