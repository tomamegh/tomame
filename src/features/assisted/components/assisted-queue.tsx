"use client";

import { useCallback, useMemo, useState } from "react";
import { ExternalLinkIcon, Loader2Icon, MessageCircleIcon, PhoneIcon } from "lucide-react";

import { AdminBadge, AdminCard, AdminEmpty } from "@/components/layout/admin";
import type { AssistedRequestRow, AssistedRequestStatus } from "@/db/queries/assisted-requests";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { hostOf } from "@/features/bag/components/format";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useAssistedQueue, useMoveAssistedRequest } from "../hooks/useAssistedQueue";
import {
  ASSISTED_ACTION_LABELS,
  assistedActionsFor,
  assistedStatusLabel,
  assistedStatusTone,
  assistedWhatsappHref,
  describeAssistedWait,
  type AssistedAction,
} from "./queue-format";

/**
 * `/admin/assisted-requests` — the queue of customers a machine could not help.
 *
 * WHAT THIS IS. Extraction gave up on a link, the customer described what they
 * wanted in their own words and left a number, and they were told a person would
 * get back to them. That promise is the whole screen: every row is somebody
 * waiting, which is why the list is OLDEST FIRST and why the wait is the first
 * thing a row says.
 *
 * A buyer answers ON WHATSAPP (approved 2026-09-13, over a phone call), so the
 * number opens a `wa.me` conversation in one click, with a draft already in the
 * box. There is deliberately no message thread in the product: the conversation
 * lives where the customer already is.
 *
 * The transitions are guarded server-side on the status the buyer saw, so two
 * buyers cannot claim the same customer. When that guard fires, this says so
 * plainly — it is information, not a fault.
 */

const TABS: { key: AssistedRequestStatus | "all"; label: string }[] = [
  { key: "open", label: "Waiting" },
  { key: "contacted", label: "In conversation" },
  { key: "resolved", label: "Sorted" },
  { key: "all", label: "All" },
];

/** `listAssistedRequests` caps at 200; a full page is a page that is hiding rows. */
const PAGE_CAP = 200;

export function AssistedQueue() {
  const [tab, setTab] = useState<AssistedRequestStatus | "all">("open");
  const { data, isPending } = useAssistedQueue(tab);
  const move = useMoveAssistedRequest();
  // WHICH row is moving, not merely that one is: the mutation is shared by the
  // list, so keying the button state off `isPending` disables every row at once.
  const [movingId, setMovingId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const onMove = useCallback(
    (row: AssistedRequestRow, to: AssistedAction, note: string | null | undefined) => {
      setMovingId(row.id);
      move.mutate(
        { id: row.id, from: row.status, status: to, ...(note !== undefined && { note }) },
        {
          onSettled: () => setMovingId(null),
          onError: (error) => {
            // A 409 means another buyer moved it first — that is information,
            // not a fault, so it is said plainly rather than as an error.
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
  const oldestWait = tab === "open" && rows[0] ? describeAssistedWait(rows[0].created_at, now) : null;

  return (
    <AdminCard
      title={TABS.find((t) => t.key === tab)?.label ?? "Requests"}
      blurb={
        oldestWait
          ? `Oldest first. The one at the top has been ${oldestWait.toLowerCase()}.`
          : "Oldest first. Each of these people was told a person would get back to them."
      }
      action={<QueueTabs value={tab} onChange={setTab} />}
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-[16px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <AdminEmpty title={emptyTitle(tab)} body={emptyBody(tab)} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <AssistedRow
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

// ── One request ──────────────────────────────────────────────────────────────

function AssistedRow({
  row,
  now,
  busy,
  onMove,
}: {
  row: AssistedRequestRow;
  now: Date;
  busy: boolean;
  onMove: (to: AssistedAction, note: string | null | undefined) => void;
}) {
  const [note, setNote] = useState(row.note ?? "");
  const actions = assistedActionsFor(row.status);
  const chat = assistedWhatsappHref(row);
  const wait = describeAssistedWait(row.created_at, now);

  /**
   * The note rides along with the transition rather than saving on its own.
   *
   * There is no note-only write: every update to a request goes through the
   * guarded `open → contacted → resolved` transition, which is what stops two
   * buyers claiming the same customer. Sending the note with the move keeps one
   * write and one guard. `undefined` means "leave whatever is there alone" — an
   * untouched box must not wipe a note somebody else wrote.
   */
  const notePayload = (): string | null | undefined => {
    const trimmed = note.trim();
    if (trimmed === (row.note ?? "")) return undefined;
    // Null, not an empty string: a buyer who clears the box means "there is no
    // note", and a row holding "" would read as one that has been written and
    // left blank.
    return trimmed.length > 0 ? trimmed : null;
  };

  return (
    <li className="flex flex-col gap-3 rounded-[16px] border border-tm-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={assistedStatusTone(row.status)}>{assistedStatusLabel(row.status)}</AdminBadge>
        {wait ? (
          <span className="text-[12px] leading-none font-semibold text-tm-text-3">{wait}</span>
        ) : null}
        <span className="text-[12px] leading-none font-medium text-tm-text-3">· {hostOf(row.product_url)}</span>
      </div>

      {/*
        The customer's own words, quoted and given room. This is the half of the
        request a machine could not get, and it is the only thing that tells a
        buyer what to shop for — so it is the largest thing on the row.
      */}
      <blockquote className="border-l-2 border-tm-coral/40 pl-3 text-[15px] leading-[1.55] font-medium text-tm-ink">
        {row.description}
      </blockquote>

      <a
        href={row.product_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 text-[12px] leading-[1.4] font-medium text-tm-text-3 transition-colors hover:text-tm-coral-strong"
      >
        <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{row.product_url}</span>
      </a>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[1.4] font-medium text-tm-text-3">
        <PhoneIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="tm-nums text-tm-text-2">{row.phone}</span>
        <span>· {row.user_id ? "signed-in customer" : "signed-out visitor"}</span>
        {row.contacted_at ? (
          <span>
            · messaged{" "}
            <span className="tm-nums">
              {new Date(row.contacted_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </span>
        ) : null}
      </p>

      {actions.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] leading-none font-semibold text-tm-text-2">
              What happened
            </span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Your own record: what they wanted, what you quoted, why it ended where it did. Saved with whichever button you press."
              className="min-h-[64px] resize-y rounded-[12px] border-tm-border bg-tm-paper text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {chat ? (
              <a
                href={chat}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tm-green-bg px-3.5 text-[13px] leading-none font-semibold text-tm-green-ink transition-opacity hover:opacity-85"
              >
                <MessageCircleIcon className="size-4" aria-hidden />
                Open WhatsApp
              </a>
            ) : (
              <span className="text-[12px] leading-none font-medium text-tm-text-3">
                That number cannot be dialled, so ring the customer back another way.
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
                  action === "contacted"
                    ? "tm-cta-gradient text-white hover:opacity-90"
                    : "bg-tm-paper text-tm-text-2 hover:bg-tm-tint hover:text-tm-ink",
                )}
              >
                {busy && action === "contacted" ? (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                ) : null}
                {ASSISTED_ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        </div>
      ) : row.note ? (
        <div className="rounded-[12px] bg-tm-paper px-3 py-2.5">
          <p className="text-[12px] leading-none font-semibold text-tm-text-3">What happened</p>
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
  value: AssistedRequestStatus | "all";
  onChange: (tab: AssistedRequestStatus | "all") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter the assisted queue">
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

function emptyTitle(tab: AssistedRequestStatus | "all"): string {
  if (tab === "open") return "Nobody is waiting";
  if (tab === "contacted") return "No conversations open";
  if (tab === "resolved") return "Nothing sorted yet";
  return "No requests yet";
}

function emptyBody(tab: AssistedRequestStatus | "all"): string {
  if (tab === "open") {
    return "Every customer who asked for a person has had one. A request lands here when extraction cannot read a link and the customer describes what they want instead.";
  }
  if (tab === "contacted") {
    return "Nothing is mid-conversation. A request moves here when a buyer messages the customer on WhatsApp.";
  }
  if (tab === "resolved") {
    return "No request has been closed off yet.";
  }
  return "Requests arrive when extraction cannot read a page and the customer asks for help instead.";
}
