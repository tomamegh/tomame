"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CameraIcon,
  EyeOffIcon,
  ImagePlusIcon,
  MessageSquareTextIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminConfirm,
  AdminEmpty,
} from "@/components/layout/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { OrderFeedback } from "@/features/feedback/types";
import {
  describeFeedbackAge,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackVerdictLabel,
  feedbackVerdictTone,
  isFeedbackConfirmation,
  partitionFeedback,
} from "@/features/feedback/components/queue-format";
import { useOrderFeedback } from "@/features/journeys/hooks/useOrderFeedback";
import { photoKindLabel } from "@/features/journeys/format";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";
import type { OrderStatus } from "@/features/orders/types";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import {
  useAdminOrderPhotos,
  useDeleteOrderPhoto,
  useUploadOrderPhotos,
} from "../hooks/useOrderPhotos";
import type { OrderPhotoView } from "../types";
import {
  DEFAULT_PHOTO_KIND,
  describePhotoMoment,
  describeSelection,
  describeSelectionProblem,
  formatPhotoSize,
  MAX_CAPTION_LENGTH,
  mayPhotographParcel,
  PHOTO_KIND_CHOICES,
  summarisePhotos,
  unansweredFeedback,
} from "./parcel-panel-format";

/**
 * "Photograph this parcel, and read what the customer said back" — on the order
 * screen, where an operator already is.
 *
 * WHY IT IS HERE. The server half of migration 054 shipped with two front ends:
 * the customer's journey screen, which shows the picture and asks the question,
 * and `/admin/feedback`, which works the answers. Nothing on `/admin/orders/[id]`
 * could take the photograph in the first place, so the one screen an operator
 * opens when they have a box in front of them had no camera on it.
 *
 * THE PHOTO IS HALF THE FEATURE. The other half is underneath it: what the
 * customer said when they saw it. Splitting the two across screens is how an
 * objection about a parcel gets answered by somebody who never looked at the
 * parcel. Answering still happens on the feedback queue, which is where the
 * guarded transition and the hold live; this panel shows the words and points
 * at that queue rather than growing a second copy of it.
 *
 * It decides nothing. `canAccessAdmin` on the routes is the authority on who may
 * upload, the service re-checks that a photo belongs to the order before it
 * deletes it, and the size and count rules here are the route's own, repeated so
 * a bad selection fails before the upload rather than after it.
 */

export interface AdminOrderParcelPanelProps {
  orderId: string;
  status: OrderStatus;
  /** Where this card sits in the page's entrance stagger. */
  index?: number;
}

export function AdminOrderParcelPanel({
  orderId,
  status,
  index = 0,
}: AdminOrderParcelPanelProps) {
  const photos = useAdminOrderPhotos(orderId);
  const feedback = useOrderFeedback(orderId);

  const canUpload = mayPhotographParcel(status);
  const rows = photos.data ?? [];
  const said = feedback.data ?? [];

  // Nothing bought and nothing said: an order that has not been paid for has no
  // parcel, and a camera on it would be furniture. It reappears the moment the
  // order is paid, which is when there is something to photograph.
  if (!canUpload && rows.length === 0 && said.length === 0) return null;

  return (
    <>
      <AdminCard
        index={index}
        title="The parcel, photographed"
        blurb={describePhotoMoment(status, rows.length > 0)}
        action={
          <AdminBadge tone={rows.length > 0 ? "green" : "muted"}>
            {photos.isPending ? "Loading" : summarisePhotos(rows)}
          </AdminBadge>
        }
      >
        <div className="flex min-w-0 flex-col gap-5">
          {canUpload ? <UploadForm orderId={orderId} /> : null}
          <PhotoList orderId={orderId} photos={rows} loading={photos.isPending} />
        </div>
      </AdminCard>

      <FeedbackCard
        index={index + 1}
        said={said}
        loading={feedback.isLoading}
        hasPhotos={rows.length > 0}
      />
    </>
  );
}

// ── Taking the photo ────────────────────────────────────────────────────────

function UploadForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const upload = useUploadOrderPhotos(orderId);
  const [refreshing, startTransition] = useTransition();

  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<string>(DEFAULT_PHOTO_KIND);
  const [caption, setCaption] = useState("");
  const [visible, setVisible] = useState(true);

  // Thumbnails of what is about to be sent. An operator who has just pressed a
  // shutter should see the frame before the customer does.
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    },
    [previews],
  );

  const busy = upload.isPending || refreshing;

  function addFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    setFiles((current) => [...current, ...chosen]);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, position) => position !== index));
  }

  function send() {
    const problem = describeSelectionProblem(files);
    if (problem) {
      toast.error({ title: "Not sent", description: problem });
      return;
    }

    upload.mutate(
      { files, kind, caption, isCustomerVisible: visible },
      {
        onSuccess: (stored) => {
          setFiles([]);
          setCaption("");
          toast.success({
            title: stored.length === 1 ? "Photo sent" : "Photos sent",
            description: visible
              ? "The customer can see it now and tell you if we bought the wrong thing."
              : "Filed against the order. The customer does not see this one.",
          });
          // The audit trail below this panel is server rendered, so the page
          // itself has to re-read for the new row to appear there.
          startTransition(() => router.refresh());
        },
        onError: (error) => {
          toast.error({ title: "Could not send that", description: error.message });
        },
      },
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-display text-[14px] leading-none font-bold text-tm-ink">
          Send the customer a photo
        </h3>
        <p className="max-w-[60ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          Up to ten pictures at a time. They appear on the customer&rsquo;s journey screen with
          an email telling them to look, and they can answer right there.
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/*
          Two pickers rather than one. A single input carrying `capture` opens
          the camera and nothing else, which is wrong on a laptop and wrong for
          an operator picking three shots they took an hour ago; a single input
          without it never offers the camera directly on the phone that is the
          normal tool for this job. The camera button is hidden above the phone
          breakpoint, where it would open a file dialog and lie about it.
        */}
        <PhotoPicker
          id={`parcel-camera-${orderId}`}
          label="Take a photo"
          icon={<CameraIcon className="size-3.5" aria-hidden />}
          capture
          disabled={busy}
          onSelect={addFiles}
          className="sm:hidden"
        />
        <PhotoPicker
          id={`parcel-files-${orderId}`}
          label="Choose photos"
          icon={<ImagePlusIcon className="size-3.5" aria-hidden />}
          multiple
          disabled={busy}
          onSelect={addFiles}
        />
        {files.length > 0 ? (
          <span className="text-[12px] leading-none font-semibold text-tm-text-3">
            {describeSelection(files)}
          </span>
        ) : null}
      </div>

      {previews.length > 0 ? (
        <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5">
          {previews.map((preview, position) => (
            <li key={`${preview.file.name}-${position}`} className="relative min-w-0">
              <img
                src={preview.url}
                alt={`Selected photo ${position + 1}, ${preview.file.name}`}
                className="aspect-square w-full rounded-[12px] border border-tm-border bg-tm-tint object-cover"
              />
              <button
                type="button"
                onClick={() => removeFile(position)}
                disabled={busy}
                className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full bg-tm-ink/80 text-white transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none disabled:opacity-50"
              >
                <XIcon className="size-3.5" aria-hidden />
                <span className="sr-only">Remove {preview.file.name} from this batch</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] leading-none font-semibold text-tm-text-2">
            What this shows
          </span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            disabled={busy}
            className="h-10 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink focus:border-tm-coral/40 focus:outline-none disabled:opacity-60"
          >
            {PHOTO_KIND_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <span className="text-[12px] leading-none font-semibold text-tm-text-2">
            A note beside the picture (optional)
          </span>
          <Textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={2}
            maxLength={MAX_CAPTION_LENGTH}
            disabled={busy}
            placeholder="Anything the photo does not say on its own. The customer reads this word for word."
            className="min-h-[64px] w-full resize-y rounded-[12px] border-tm-border bg-card text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
          />
        </label>
      </div>

      <label className="flex min-w-0 items-start gap-2.5">
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
          disabled={busy}
          className="mt-0.5 size-4 shrink-0 accent-tm-coral"
        />
        <span className="min-w-0 text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          Show this to the customer.{" "}
          {visible
            ? "They are emailed once for the batch and can answer on their journey screen."
            : "Kept internal. Nobody outside the admin will ever see it."}
        </span>
      </label>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AdminButton variant="primary" busy={busy} disabled={files.length === 0} onClick={send}>
          <SendIcon className="size-3.5" aria-hidden />
          {files.length > 1 ? "Send the photos" : "Send the photo"}
        </AdminButton>
        {files.length > 0 ? (
          <AdminButton variant="quiet" disabled={busy} onClick={() => setFiles([])}>
            Clear
          </AdminButton>
        ) : null}
      </div>
    </section>
  );
}

/**
 * A file input that looks like the rest of the admin.
 *
 * The input keeps its own focus and its own keyboard behaviour and is merely
 * taken out of the flow, rather than being replaced by a button that clicks it:
 * the label is the accessible name, the ring follows the real control, and the
 * picker opens from the keyboard. Its value is cleared after every pick so that
 * choosing the same file twice still fires a change.
 */
function PhotoPicker({
  id,
  label,
  icon,
  capture = false,
  multiple = false,
  disabled = false,
  onSelect,
  className,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  capture?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  onSelect: (files: File[]) => void;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0", className)}>
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple={multiple}
        {...(capture ? { capture: "environment" as const } : {})}
        disabled={disabled}
        onChange={(event) => {
          onSelect(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-tm-border bg-card px-4",
          "text-[13px] leading-none font-semibold whitespace-nowrap text-tm-ink transition-colors hover:bg-tm-paper",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-tm-coral/40",
          disabled && "cursor-not-allowed opacity-55",
        )}
      >
        {icon}
        {label}
      </label>
    </span>
  );
}

// ── What is already on the order ────────────────────────────────────────────

function PhotoList({
  orderId,
  photos,
  loading,
}: {
  orderId: string;
  photos: OrderPhotoView[];
  loading: boolean;
}) {
  const remove = useDeleteOrderPhoto(orderId);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<OrderPhotoView | null>(null);

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading the photos on this order</span>
        <Skeleton className="h-40 w-full rounded-[16px]" />
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <AdminEmpty
        title="Nothing photographed yet"
        body="The customer's journey screen says a picture will appear when the parcel reaches our hub. Until one does, they are taking our word for what is in the box."
      />
    );
  }

  function confirmRemoval() {
    if (!pending) return;
    const photo = pending;
    remove.mutate(photo.id, {
      onSuccess: () => {
        setPending(null);
        toast.success({
          title: "Photo removed",
          description: "It is gone from the customer's screen. The audit log keeps what it was.",
        });
        startTransition(() => router.refresh());
      },
      onError: (error) => {
        toast.error({ title: "Could not remove it", description: error.message });
      },
    });
  }

  return (
    <>
      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <li key={photo.id} className="min-w-0">
            <figure className="flex min-w-0 flex-col gap-2.5 rounded-[16px] border border-tm-border bg-card p-3">
              {/*
                The bytes come from a private route that re-checks the caller on
                every request and answers no-store, so the image optimiser has
                nothing to cache and no way to fetch it as this admin. The
                re-encoded dimensions are set as attributes, so the box is
                reserved before a byte arrives and nothing below it jumps.
              */}
              <img
                src={photo.url}
                alt={`Parcel photo, ${photoKindLabel(photo.kind).toLowerCase()}`}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
                className="h-auto max-h-[320px] w-full max-w-full min-w-0 rounded-[12px] bg-tm-tint object-contain"
              />
              <figcaption className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <AdminBadge tone="neutral">{photoKindLabel(photo.kind)}</AdminBadge>
                  {photo.isCustomerVisible ? null : (
                    <AdminBadge tone="amber">
                      <EyeOffIcon className="mr-1 inline size-3 align-[-1px]" aria-hidden />
                      Internal only
                    </AdminBadge>
                  )}
                  <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
                    {formatAdminDateTime(photo.takenAt) ?? "Just now"} ·{" "}
                    {formatPhotoSize(photo.byteSize)}
                  </span>
                </div>
                {photo.caption ? (
                  <p className="min-w-0 rounded-[12px] bg-tm-paper px-3 py-2 text-[13px] leading-[1.5] break-words text-tm-text-2">
                    &ldquo;{photo.caption}&rdquo;
                  </p>
                ) : null}
                <div>
                  <AdminButton
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => setPending(photo)}
                  >
                    <Trash2Icon className="size-3.5" aria-hidden />
                    Take it down
                  </AdminButton>
                </div>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <AdminConfirm
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title="Take this photo down?"
        consequence="The picture leaves the customer's journey screen and the file is deleted. Anything they already said about it stays, and the audit log keeps a description of what went."
        confirmLabel="Delete it"
        busy={remove.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}

// ── What the customer said back ─────────────────────────────────────────────

/**
 * The customer's answer, read-only and right under the picture it is about.
 *
 * Read-only ON PURPOSE. Claiming, answering and closing a row is a guarded
 * transition carrying the status the admin saw, and stopping the parcel is a
 * separate audited decision with a required reason. Both of those live on
 * `/admin/feedback`, and a second set of buttons here would be a second place
 * for two admins to race each other. What this screen owes an operator is the
 * words, not another copy of the queue.
 */
function FeedbackCard({
  said,
  loading,
  hasPhotos,
  index,
}: {
  said: OrderFeedback[];
  loading: boolean;
  hasPhotos: boolean;
  index: number;
}) {
  const now = useMemo(() => new Date(), []);
  const waiting = unansweredFeedback(said);
  const { complaints, confirmations } = partitionFeedback(said);
  const ordered = [...complaints, ...confirmations];

  return (
    <AdminCard
      index={index}
      title="What the customer said"
      blurb={
        said.length === 0
          ? "Their answer to the photograph lands here. It is the half of this that matters: the picture alone is just a picture."
          : "Their own words about this parcel. Answering one, or stopping the box, happens on the feedback queue."
      }
      action={
        waiting.length > 0 ? (
          <Link
            href="/admin/feedback"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border px-3.5 text-[12.5px] font-semibold text-tm-coral-strong transition-colors hover:border-tm-coral/30"
          >
            <MessageSquareTextIcon className="size-3.5" aria-hidden />
            {waiting.length === 1 ? "1 waiting on you" : `${waiting.length} waiting on you`}
          </Link>
        ) : null
      }
    >
      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading what the customer said</span>
          <Skeleton className="h-24 w-full rounded-[16px]" />
        </div>
      ) : ordered.length === 0 ? (
        <AdminEmpty
          title="Nothing said yet"
          body={
            hasPhotos
              ? "The customer has seen the photo and has not answered. No news is usually good news, but the question is on their screen if you want to chase it."
              : "They cannot answer until there is something to look at. Photograph the parcel and the question appears on their journey screen."
          }
        />
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {ordered.map((row) => (
            <FeedbackEntry key={row.id} row={row} now={now} />
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

function FeedbackEntry({ row, now }: { row: OrderFeedback; now: Date }) {
  const confirmation = isFeedbackConfirmation(row.verdict);
  const age = describeFeedbackAge(row.created_at, now, row.verdict);

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-[16px] border p-4",
        confirmation
          ? "border-tm-green/25 bg-tm-green-bg/25"
          : "border-tm-border bg-card",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AdminBadge tone={feedbackVerdictTone(row.verdict)}>
          {feedbackVerdictLabel(row.verdict)}
        </AdminBadge>
        <AdminBadge tone={feedbackStatusTone(row.status, row.verdict)}>
          {feedbackStatusLabel(row.status, row.verdict)}
        </AdminBadge>
        {age ? (
          <span className="text-[12px] leading-none font-semibold text-tm-text-3">{age}</span>
        ) : null}
      </div>

      <blockquote
        className={cn(
          "min-w-0 border-l-2 pl-3 text-[14px] leading-[1.55] font-medium break-words text-tm-ink",
          confirmation ? "border-tm-green/40" : "border-tm-coral/40",
        )}
      >
        {row.message}
      </blockquote>

      {row.resolution ? (
        <div className="min-w-0 rounded-[12px] bg-tm-paper px-3 py-2.5">
          <p className="text-[12px] leading-none font-semibold text-tm-text-3">
            What the customer was told
          </p>
          <p className="mt-1.5 min-w-0 text-[13px] leading-[1.5] break-words whitespace-pre-wrap text-tm-text-2">
            {row.resolution}
          </p>
        </div>
      ) : null}
    </li>
  );
}
