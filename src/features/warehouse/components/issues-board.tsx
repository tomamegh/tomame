"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2Icon, PauseCircleIcon, PlayCircleIcon, QuoteIcon } from "lucide-react";

import { AdminBadge } from "@/components/layout/admin/admin-page";
import { AdminButton } from "@/components/layout/admin/controls";
import type { OrderFeedbackStatus } from "@/db/queries/order-feedback";
import { ParcelHoldDialog } from "@/features/feedback/components/parcel-hold-dialog";
import {
  canOfferHold,
  feedbackActionLabel,
  feedbackActionsFor,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackVerdictLabel,
  feedbackVerdictTone,
  isFeedbackConfirmation,
} from "@/features/feedback/components/queue-format";
import { useHoldOrder, useMoveOrderFeedback, useReleaseOrderHold } from "@/features/feedback/hooks/useFeedbackQueue";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { WarehouseIssue } from "../types";
import { warehousePhotoUrl } from "../types";
import { formatRelative } from "./format";
import { errorText } from "./warehouse-actions";
import { ItemThumb, StageBadge } from "./warehouse-ui";

/**
 * Customer objections, worked at the bench (081). The verdict, status and
 * action rules are `feedback/components/queue-format.ts`, shared with the queue
 * this replaces, so the words a customer reads back cannot drift.
 */

const TABS: Array<{ value: OrderFeedbackStatus; label: string }> = [
  { value: "open", label: "Waiting" },
  { value: "in_review", label: "Being looked at" },
  { value: "resolved", label: "Sorted" },
  { value: "dismissed", label: "Dismissed" },
];

export function IssuesBoard({ issues, status }: { issues: WarehouseIssue[]; status: OrderFeedbackStatus }) {
  const complaints = issues.filter((i) => !isFeedbackConfirmation(i.verdict));
  const confirmations = issues.filter((i) => isFeedbackConfirmation(i.verdict));

  return (
    <div className="flex flex-col gap-5">
      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Filter issues">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/warehouse/issues?status=${tab.value}`}
            aria-current={status === tab.value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
              status === tab.value ? "border-tm-ink bg-tm-ink text-white" : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {complaints.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-tm-border bg-card px-6 py-12 text-center">
          <CheckCircle2Icon className="size-8 text-tm-green" aria-hidden />
          <p className="font-display text-[17px] font-bold text-tm-ink">
            {status === "open" ? "No one is waiting on us" : "Nothing here"}
          </p>
          <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
            When a customer says a photographed parcel is wrong, it lands here with the photo they meant.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {complaints.map((issue, i) => (
            <IssueCard key={issue.id} issue={issue} index={i} />
          ))}
        </ul>
      )}

      {confirmations.length > 0 ? (
        <details className="group rounded-[20px] border border-tm-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span className="text-[14px] font-semibold text-tm-ink">
              {confirmations.length} customer{confirmations.length === 1 ? "" : "s"} confirmed their parcel
            </span>
            <span className="text-[12.5px] font-semibold text-tm-text-3 group-open:hidden">Show</span>
          </summary>
          <ul className="flex flex-col gap-3 border-t border-tm-hairline p-4">
            {confirmations.map((issue, i) => (
              <IssueCard key={issue.id} issue={issue} index={i} compact />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function IssueCard({ issue, index, compact = false }: { issue: WarehouseIssue; index: number; compact?: boolean }) {
  const router = useRouter();
  const move = useMoveOrderFeedback();
  const hold = useHoldOrder();
  const release = useReleaseOrderHold();
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [holdMode, setHoldMode] = useState<"hold" | "release" | null>(null);
  const actions = feedbackActionsFor(issue.status, issue.verdict);
  const item = issue.item;

  const run = (to: "in_review" | "resolved" | "dismissed") => {
    move.mutate(
      {
        id: issue.id,
        from: issue.status,
        status: to,
        ...(to !== "in_review" && resolution.trim() ? { resolution: resolution.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success({ title: feedbackActionLabel(to, issue.verdict), description: item ? item.order_no : undefined });
          router.refresh();
        },
        onError: (error) => toast.error({ title: "Could not update it", description: errorText(error) }),
      },
    );
  };

  const confirmHold = (text: string) => {
    const done = () => {
      setHoldMode(null);
      router.refresh();
    };
    const onError = (error: unknown) => toast.error({ title: "Could not change the hold", description: errorText(error) });
    if (holdMode === "hold") {
      hold.mutate({ orderId: issue.order_id, reason: text, feedbackId: issue.id }, { onSuccess: done, onError });
    } else {
      release.mutate({ orderId: issue.order_id, note: text }, { onSuccess: done, onError });
    }
  };

  return (
    <li
      className="tm-up flex flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-4 [animation-duration:0.45s] sm:p-5"
      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={feedbackVerdictTone(issue.verdict)}>{feedbackVerdictLabel(issue.verdict)}</AdminBadge>
        <AdminBadge tone={feedbackStatusTone(issue.status, issue.verdict)}>
          {feedbackStatusLabel(issue.status, issue.verdict)}
        </AdminBadge>
        <span className="ml-auto text-[12px] font-medium text-tm-text-3">{formatRelative(issue.created_at)}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        {issue.photo_id ? (
          <a
            href={warehousePhotoUrl(issue.photo_id)}
            target="_blank"
            rel="noreferrer"
            className="relative block size-[108px] shrink-0 overflow-hidden rounded-[16px] border border-tm-hairline"
            title="The photo the customer replied to"
          >
            <img src={warehousePhotoUrl(issue.photo_id)} alt="Parcel photo" className="size-full object-cover" />
          </a>
        ) : item ? (
          <ItemThumb item={item} size={108} rounded={16} />
        ) : null}

        <div className="flex min-w-0 flex-col gap-2.5">
          {item ? (
            <Link href={`/warehouse/items/${item.order_id}`} className="flex min-w-0 flex-col gap-0.5 hover:underline">
              <span className="line-clamp-1 text-[14px] font-semibold text-tm-ink">{item.title}</span>
              <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-tm-text-3">
                <span className="font-mono text-tm-text-2">{item.order_no}</span>
                <span>{item.recipient.name ?? "Customer"}</span>
                <StageBadge stage={item.stage} />
                {item.held ? <AdminBadge tone="coral">On hold</AdminBadge> : null}
              </span>
            </Link>
          ) : null}
          <blockquote className="relative rounded-[14px] bg-tm-paper px-4 py-3 pl-10 text-[13.5px] leading-[1.55] font-medium text-tm-ink">
            <QuoteIcon className="absolute top-3 left-3.5 size-4 text-tm-text-3" aria-hidden />
            {issue.message}
          </blockquote>
          {issue.resolution && (issue.status === "resolved" || issue.status === "dismissed") ? (
            <p className="text-[12.5px] font-medium text-tm-text-2">
              <span className="font-semibold text-tm-ink">We said:</span> {issue.resolution}
            </p>
          ) : null}
        </div>
      </div>

      {actions.length > 0 && !compact ? (
        <div className="flex flex-col gap-3 border-t border-tm-hairline pt-4">
          {actions.some((a) => a !== "in_review") ? (
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="What you did about it. The customer reads this."
              className="resize-none rounded-[12px] border border-tm-border bg-card px-3 py-2.5 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <AdminButton
                key={action}
                variant={action === "resolved" ? "primary" : action === "dismissed" ? "quiet" : "secondary"}
                busy={move.isPending && move.variables?.status === action}
                disabled={move.isPending}
                onClick={() => run(action)}
              >
                {feedbackActionLabel(action, issue.verdict)}
              </AdminButton>
            ))}
            {canOfferHold(issue.status, issue.verdict) && item ? (
              item.held ? (
                <AdminButton variant="secondary" className="ml-auto" onClick={() => setHoldMode("release")}>
                  <PlayCircleIcon className="size-4" aria-hidden />
                  Release parcel
                </AdminButton>
              ) : (
                <AdminButton variant="danger" className="ml-auto" onClick={() => setHoldMode("hold")}>
                  <PauseCircleIcon className="size-4" aria-hidden />
                  Hold parcel
                </AdminButton>
              )
            ) : null}
          </div>
        </div>
      ) : compact && actions.length > 0 ? (
        <div>
          <AdminButton variant="secondary" busy={move.isPending} onClick={() => run("resolved")}>
            {feedbackActionLabel("resolved", issue.verdict)}
          </AdminButton>
        </div>
      ) : null}

      <ParcelHoldDialog
        open={holdMode !== null}
        onOpenChange={(o) => !o && setHoldMode(null)}
        mode={holdMode ?? "hold"}
        orderRef={item?.order_no ?? "this parcel"}
        standingReason={item?.held?.reason ?? null}
        busy={hold.isPending || release.isPending}
        onConfirm={confirmHold}
      />
    </li>
  );
}
