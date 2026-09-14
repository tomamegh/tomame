"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { CameraIcon, PackageIcon, PauseCircleIcon, PlayCircleIcon } from "lucide-react";

import { AdminBadge, AdminButton, AdminCard, AdminEmpty } from "@/components/layout/admin";
import type { OrderFeedbackRow, OrderFeedbackStatus } from "@/db/queries/order-feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import {
  useFeedbackQueue,
  useHoldOrder,
  useMoveOrderFeedback,
  useReleaseOrderHold,
} from "../hooks/useFeedbackQueue";
import { ParcelHoldDialog } from "./parcel-hold-dialog";
import {
  canOfferHold,
  describeFeedbackAge,
  describeOldestWait,
  extractHoldReason,
  feedbackActionLabel,
  feedbackActionsFor,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackVerdictLabel,
  feedbackVerdictTone,
  isFeedbackConfirmation,
  partitionFeedback,
  shortOrderRef,
  type FeedbackAction,
} from "./queue-format";

/**
 * `/admin/feedback` — what customers say about the photograph of their parcel.
 *
 * WHAT THIS IS. A parcel reaches the US hub, an admin photographs it, and the
 * customer sees the first picture of what was actually BOUGHT rather than what
 * they asked for. This is where their answer lands, and it lands while the box
 * is still on a shelf in America — the only window in which a wrong item is
 * cheap to put right.
 *
 * TWO HALVES, ON PURPOSE. The complaints are the queue. The confirmations are
 * the result: `looks_right` is a customer saying we got it right, which is the
 * most useful signal the feature produces, and it is shown below the work in its
 * own card with its own words, its own green, and no hold button anywhere near
 * it. It is never a row to "resolve".
 *
 * FEEDBACK DOES NOT STOP THE PARCEL. Kelvin's decision: an admin decides, per
 * case. Nothing a customer types pauses anything — the hold is a separate,
 * separately audited action on this screen, and it asks for a reason before it
 * happens.
 *
 * The transitions are guarded server-side on the status the admin saw, so two
 * admins cannot work one row. When that guard fires this says so in the server's
 * own words: it is information, not a fault.
 */

/** `listOrderFeedback` caps at 200; a full page is a page that is hiding rows. */
const PAGE_CAP = 200;

/** What this screen has been told about an order's hold, keyed by order id. */
type HoldKnowledge = { held: true; reason: string | null } | { held: false };

export interface FeedbackQueueProps {
  /** The filter, resolved from the URL by the server page. */
  status: OrderFeedbackStatus | "all";
}

export function FeedbackQueue({ status }: FeedbackQueueProps) {
  const { data, isPending } = useFeedbackQueue(status);
  const move = useMoveOrderFeedback();
  const hold = useHoldOrder();
  const release = useReleaseOrderHold();

  // WHICH row is moving, not merely that one is: the mutation is shared by the
  // list, so keying the button state off `isPending` disables every row at once.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ row: OrderFeedbackRow; mode: "hold" | "release" } | null>(
    null,
  );
  /**
   * The feedback row carries no hold state and the queue route does not join
   * one, so this screen only ever claims a parcel is held when the server has
   * said so — on a successful hold, or in the 409 that names the standing
   * reason. Unknown stays unknown rather than being guessed at.
   */
  const [holds, setHolds] = useState<Record<string, HoldKnowledge>>({});

  const now = useMemo(() => new Date(), []);

  const onMove = useCallback(
    (row: OrderFeedbackRow, to: FeedbackAction, resolution: string | null | undefined) => {
      setMovingId(row.id);
      move.mutate(
        { id: row.id, from: row.status, status: to, ...(resolution !== undefined && { resolution }) },
        {
          onSettled: () => setMovingId(null),
          onError: (error) => {
            /**
             * 409 means a colleague took this row while this admin was reading
             * it — the server guards the UPDATE on the status that was on
             * screen. The server's own sentence is shown verbatim rather than
             * paraphrased, so the two can never drift apart, and the queue has
             * already refetched by the time this is read.
             */
            if (error instanceof ApiFetchError && error.status === 409) {
              toast.info({ title: "Someone else got there first", description: error.message });
              return;
            }
            toast.error({ title: "Could not update that", description: error.message });
          },
        },
      );
    },
    [move],
  );

  const onHoldConfirm = useCallback(
    (text: string) => {
      if (!dialog) return;
      const { row, mode } = dialog;
      const orderId = row.order_id;

      if (mode === "hold") {
        hold.mutate(
          { orderId, reason: text, feedbackId: row.id },
          {
            onSuccess: (order) => {
              setHolds((prev) => ({ ...prev, [orderId]: { held: true, reason: order.hold_reason } }));
              setDialog(null);
              toast.success({
                title: "The parcel is on hold",
                description: "It will refuse to advance until somebody lifts it.",
              });
            },
            onError: (error) => {
              // Already held. The message names the reason it is standing on,
              // which is the only way this screen ever learns it.
              if (error instanceof ApiFetchError && error.status === 409) {
                setHolds((prev) => ({
                  ...prev,
                  [orderId]: { held: true, reason: extractHoldReason(error.message) },
                }));
                setDialog(null);
                toast.info({ title: "That parcel is already stopped", description: error.message });
                return;
              }
              toast.error({ title: "Could not hold it", description: error.message });
            },
          },
        );
        return;
      }

      release.mutate(
        { orderId, note: text || null },
        {
          onSuccess: () => {
            setHolds((prev) => ({ ...prev, [orderId]: { held: false } }));
            setDialog(null);
            toast.success({
              title: "The hold is lifted",
              description: "Moving it on is a separate decision, on the order itself.",
            });
          },
          onError: (error) => {
            if (error instanceof ApiFetchError && error.status === 409) {
              setHolds((prev) => ({ ...prev, [orderId]: { held: false } }));
              setDialog(null);
              toast.info({ title: "That parcel is not on hold", description: error.message });
              return;
            }
            toast.error({ title: "Could not lift the hold", description: error.message });
          },
        },
      );
    },
    [dialog, hold, release],
  );

  const rows = data ?? [];
  const { complaints, confirmations } = partitionFeedback(rows);
  const oldest = complaints[0];
  const oldestWait = status === "open" && oldest ? describeOldestWait(oldest.created_at, now) : null;

  if (isPending) {
    return (
      <AdminCard title="Loading the queue" blurb="Oldest first.">
        <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading parcel feedback</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[16px]" />
          ))}
        </div>
      </AdminCard>
    );
  }

  return (
    <>
      <AdminCard
        title={complaintsTitle(status)}
        blurb={
          oldestWait
            ? `Oldest first. ${oldestWait}. The box is still at the hub, where putting it right is still cheap.`
            : "Oldest first. Every one of these is a parcel we are still holding, so it can still be fixed."
        }
      >
        {complaints.length === 0 ? (
          <AdminEmpty title={emptyTitle(status)} body={emptyBody(status)} />
        ) : (
          <ul className="flex flex-col gap-3">
            {complaints.map((row) => (
              <FeedbackRow
                key={row.id}
                row={row}
                now={now}
                busy={movingId === row.id}
                hold={holds[row.order_id]}
                onMove={(to, resolution) => onMove(row, to, resolution)}
                onHold={() => setDialog({ row, mode: "hold" })}
                onRelease={() => setDialog({ row, mode: "release" })}
              />
            ))}
          </ul>
        )}
      </AdminCard>

      {/*
        The good news, kept apart and kept below. These customers looked at the
        photograph of their own parcel and told us we bought the right thing —
        the outcome the whole feature is for. Nothing here is a problem, so
        nothing here offers to stop a parcel or to be "resolved".
      */}
      {confirmations.length > 0 ? (
        <AdminCard
          index={1}
          title="Customers who said it looks right"
          blurb="Nothing to fix. This is the answer the photo was taken for. File each one when you have read it, so the queue count stays honest."
        >
          <ul className="flex flex-col gap-3">
            {confirmations.map((row) => (
              <FeedbackRow
                key={row.id}
                row={row}
                now={now}
                busy={movingId === row.id}
                hold={holds[row.order_id]}
                onMove={(to, resolution) => onMove(row, to, resolution)}
                onHold={() => setDialog({ row, mode: "hold" })}
                onRelease={() => setDialog({ row, mode: "release" })}
              />
            ))}
          </ul>
        </AdminCard>
      ) : null}

      {rows.length >= PAGE_CAP ? (
        <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
          Showing the oldest <span className="tm-nums">{PAGE_CAP}</span>. Work these down and the
          rest will appear.
        </p>
      ) : null}

      {dialog ? (
        <ParcelHoldDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          mode={dialog.mode}
          orderRef={shortOrderRef(dialog.row.order_id)}
          standingReason={holdReasonOf(holds[dialog.row.order_id])}
          busy={hold.isPending || release.isPending}
          onConfirm={onHoldConfirm}
        />
      ) : null}
    </>
  );
}

// ── One piece of feedback ────────────────────────────────────────────────────

function FeedbackRow({
  row,
  now,
  busy,
  hold,
  onMove,
  onHold,
  onRelease,
}: {
  row: OrderFeedbackRow;
  now: Date;
  busy: boolean;
  hold: HoldKnowledge | undefined;
  onMove: (to: FeedbackAction, resolution: string | null | undefined) => void;
  onHold: () => void;
  onRelease: () => void;
}) {
  const [resolution, setResolution] = useState(row.resolution ?? "");
  // Which button was pressed, so the spinner lands on the one the admin clicked
  // rather than always on the first — `busy` only says that this ROW is moving.
  const [pressed, setPressed] = useState<FeedbackAction | null>(null);

  const confirmation = isFeedbackConfirmation(row.verdict);
  const actions = feedbackActionsFor(row.status, row.verdict);
  const age = describeFeedbackAge(row.created_at, now, row.verdict);
  const held = hold?.held === true;

  /**
   * The resolution rides along with the transition rather than saving on its
   * own. There is no resolution-only write: every update goes through the
   * guarded transition, which is what stops two admins claiming one customer.
   * `undefined` means "leave whatever is there alone" — an untouched box must
   * not wipe words somebody else wrote.
   */
  const resolutionPayload = (): string | null | undefined => {
    const trimmed = resolution.trim();
    if (trimmed === (row.resolution ?? "")) return undefined;
    // Null, not an empty string: a cleared box means "there is no answer yet",
    // and a row holding "" reads as one that was written and left blank.
    return trimmed.length > 0 ? trimmed : null;
  };

  return (
    <li
      className={
        confirmation
          ? "flex flex-col gap-3 rounded-[16px] border border-tm-green/25 bg-tm-green-bg/25 p-4"
          : "flex flex-col gap-3 rounded-[16px] border border-tm-border bg-card p-4"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={feedbackVerdictTone(row.verdict)}>
          {feedbackVerdictLabel(row.verdict)}
        </AdminBadge>
        <AdminBadge tone={feedbackStatusTone(row.status, row.verdict)}>
          {feedbackStatusLabel(row.status, row.verdict)}
        </AdminBadge>
        {age ? (
          <span className="text-[12px] leading-none font-semibold text-tm-text-3">{age}</span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-[12px] leading-none font-medium text-tm-text-3">
          <CameraIcon className="size-3.5 shrink-0" aria-hidden />
          {row.photo_id ? "about a photo" : "about the parcel"}
        </span>
      </div>

      {/*
        The customer's own words. On a complaint this is the only description of
        what is wrong, and on a confirmation it is the thing worth reading — so
        it is the largest element either way.
      */}
      <blockquote
        className={
          confirmation
            ? "border-l-2 border-tm-green/40 pl-3 text-[15px] leading-[1.55] font-medium text-tm-ink"
            : "border-l-2 border-tm-coral/40 pl-3 text-[15px] leading-[1.55] font-medium text-tm-ink"
        }
      >
        {row.message}
      </blockquote>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[1.4] font-medium text-tm-text-3">
        <Link
          href={`/admin/orders/${row.order_id}`}
          className="inline-flex min-w-0 items-center gap-1.5 transition-colors hover:text-tm-coral-strong"
        >
          <PackageIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Order <span className="tm-nums text-tm-text-2">{shortOrderRef(row.order_id)}</span>
          </span>
        </Link>
        <span className="tm-nums">
          ·{" "}
          {new Date(row.created_at).toLocaleString("en-GB", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
        {row.resolved_at ? (
          <span className="tm-nums">
            · answered{" "}
            {new Date(row.resolved_at).toLocaleString("en-GB", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        ) : null}
      </div>

      {held ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] bg-tm-amber-bg px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[12.5px] leading-[1.5] font-medium text-[#7a4a06]">
            <PauseCircleIcon className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />
            <span className="font-bold">This parcel is stopped.</span>{" "}
            {holdReasonOf(hold) ?? "The reason is on the order."}
          </p>
          <AdminButton variant="secondary" onClick={onRelease}>
            <PlayCircleIcon className="size-3.5" aria-hidden />
            Let it go
          </AdminButton>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {/*
            No resolution box on a confirmation: there is nothing to tell the
            customer back, and asking an admin to write one would turn a
            thank-you into a piece of paperwork.
          */}
          {confirmation ? null : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] leading-none font-semibold text-tm-text-2">
                What you did about it (the customer reads this)
              </span>
              <Textarea
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="What you checked, what you found, and what happens next. Saved with whichever button you press."
                className="min-h-[64px] resize-y rounded-[12px] border-tm-border bg-tm-paper text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
              />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <AdminButton
                key={action}
                variant={action === "in_review" || confirmation ? "primary" : "quiet"}
                busy={busy && pressed === action}
                disabled={busy}
                onClick={() => {
                  setPressed(action);
                  onMove(action, resolutionPayload());
                }}
              >
                {feedbackActionLabel(action, row.verdict)}
              </AdminButton>
            ))}

            {/*
              The second decision, and it is never the same click as answering
              the customer. Offered only on a live complaint — a customer
              confirming their parcel must not be one mis-click from having it
              stopped.
            */}
            {canOfferHold(row.status, row.verdict) && !held ? (
              <AdminButton variant="danger" onClick={onHold} disabled={busy}>
                <PauseCircleIcon className="size-3.5" aria-hidden />
                Stop the parcel
              </AdminButton>
            ) : null}
          </div>
        </div>
      ) : row.resolution ? (
        <div className="rounded-[12px] bg-tm-paper px-3 py-2.5">
          <p className="text-[12px] leading-none font-semibold text-tm-text-3">
            What the customer was told
          </p>
          <p className="mt-1.5 text-[13px] leading-[1.5] whitespace-pre-wrap text-tm-text-2">
            {row.resolution}
          </p>
        </div>
      ) : null}
    </li>
  );
}

// ── Copy ─────────────────────────────────────────────────────────────────────

function holdReasonOf(knowledge: HoldKnowledge | undefined): string | null {
  return knowledge?.held ? knowledge.reason : null;
}

function complaintsTitle(status: OrderFeedbackStatus | "all"): string {
  switch (status) {
    case "open":
      return "Waiting on a person";
    case "in_review":
      return "Being looked at";
    case "resolved":
      return "Sorted";
    case "dismissed":
      return "Nothing in it";
    default:
      return "Everything customers have said";
  }
}

function emptyTitle(status: OrderFeedbackStatus | "all"): string {
  switch (status) {
    case "open":
      return "Nobody is waiting";
    case "in_review":
      return "Nothing is mid-investigation";
    case "resolved":
      return "Nothing sorted yet";
    case "dismissed":
      return "Nothing has been waved through";
    default:
      return "No feedback yet";
  }
}

function emptyBody(status: OrderFeedbackStatus | "all"): string {
  switch (status) {
    case "open":
      return "No customer is objecting to a parcel photo. One lands here the moment somebody looks at a picture of their box and says something is wrong with it.";
    case "in_review":
      return "Nothing has been claimed and left open. A row moves here when an admin presses “I’m on it”.";
    case "resolved":
      return "No objection has been answered yet. What you write when you close one is shown to the customer.";
    case "dismissed":
      return "Nothing has been closed as a false alarm. Use it when the photo turns out to be right after all.";
    default:
      return "Feedback arrives when a parcel is photographed at the US hub and the customer tells us what they see.";
  }
}
