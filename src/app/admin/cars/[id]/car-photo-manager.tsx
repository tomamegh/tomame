"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  ImagePlusIcon,
  StarIcon,
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
import type { CarPhotoView } from "@/features/cars/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * The gallery of one car (migration 067).
 *
 * MODELLED ON THE PARCEL PHOTO PANEL (`features/order-photos/components/
 * admin-parcel-panel.tsx`) rather than invented, because the risky parts are the
 * same and re-deriving them per feature is how one of them ends up wrong: two
 * pickers rather than one, a preview of the batch before it is sent, the file
 * input kept as the real focusable control, and a stated consequence on every
 * deletion. What differs is what a car gallery has and a parcel does not — an
 * ORDER and a COVER.
 *
 * A DRAFT'S PHOTOGRAPHS DO RENDER HERE. `/api/cars/photos/[photoId]` has an
 * admin branch precisely so that the person who has just uploaded eight pictures
 * to an unpublished listing can look at them, instead of having to publish a car
 * to the public in order to see what they are about to publish.
 *
 * THE COVER IS NOT A COSMETIC CHOICE. It is the only picture of this car that
 * appears on the storefront's list, and without an explicit one the list falls
 * back to "the first by sort order" — a different picture the moment anything is
 * reordered. The first upload on an empty listing becomes the cover on its own;
 * this is where it gets moved.
 *
 * REORDERING IS BUTTONS, NOT DRAG AND DROP. A drag target is unreachable from a
 * keyboard and unusable on the phone an operator is holding when they have just
 * photographed a car. Each press sends the WHOLE list in its new order, which is
 * what `reorderCarPhotos` wants: replaying a dropped request produces the same
 * arrangement, whereas a swap replayed twice undoes itself.
 */

/**
 * Both mirror `features/cars/services/car-photos.service.ts`, which is
 * `server-only` and cannot be imported here. They are restated so a bad
 * selection fails before the upload rather than after it; the service remains
 * the authority.
 */
const MAX_PHOTOS_PER_UPLOAD = 12;
const MAX_PHOTOS_PER_LISTING = 40;
/** `MAX_UPLOAD_BYTES` in `features/media/services/image-upload`, restated. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function CarPhotoManager({
  carListingId,
  initialPhotos,
  isPublished,
  index = 0,
}: {
  carListingId: string;
  initialPhotos: readonly CarPhotoView[];
  isPublished: boolean;
  index?: number;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<CarPhotoView[]>([...initialPhotos]);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CarPhotoView | null>(null);
  const [, startTransition] = useTransition();

  // The server page re-reads on `router.refresh()`, and its props are what this
  // list was seeded from. Without this an upload would be shown twice — once
  // from the response and once from the refreshed prop — or, worse, a deletion
  // would come back.
  useEffect(() => {
    setPhotos([...initialPhotos]);
  }, [initialPhotos]);

  const remaining = MAX_PHOTOS_PER_LISTING - photos.length;

  function applyServerPhotos(next: CarPhotoView[]) {
    setPhotos(next);
    // The publish control on this page is server rendered and is gated on there
    // being a photograph, so it has to re-read for the first upload to unlock it.
    startTransition(() => router.refresh());
  }

  async function reorder(nextOrder: CarPhotoView[], coverId?: string) {
    setBusy(true);
    // Shown in the new order immediately: the whole point of a nudge button is
    // that the picture moves under the finger that pressed it.
    setPhotos(nextOrder);
    try {
      const response = await apiFetch<ApiSuccessResponse<{ photos: CarPhotoView[] }>>(
        `/api/admin/cars/${carListingId}/photos`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photo_ids: nextOrder.map((photo) => photo.id),
            cover_photo_id: coverId ?? null,
          }),
        },
      );
      applyServerPhotos(response.data.photos);
      if (coverId) {
        toast.success({
          title: "Cover moved",
          description: "This is the picture the storefront list shows for this car.",
        });
      }
    } catch (error) {
      // Put it back. The optimistic order was a guess and the server refused it.
      setPhotos([...initialPhotos]);
      toast.error({
        title: "Could not rearrange the gallery",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length || busy) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    void reorder(next);
  }

  function makeCover(photo: CarPhotoView) {
    if (busy || photo.is_cover) return;
    void reorder(photos, photo.id);
  }

  async function confirmDelete() {
    const photo = pendingDelete;
    if (!photo) return;
    setBusy(true);
    try {
      await apiFetch(
        `/api/admin/cars/${carListingId}/photos?photo_id=${encodeURIComponent(photo.id)}`,
        { method: "DELETE" },
      );
      setPendingDelete(null);
      applyServerPhotos(photos.filter((entry) => entry.id !== photo.id));
      toast.success({
        title: "Photo deleted",
        description: photo.is_cover
          ? "It was the cover, so the next picture has taken its place."
          : "The file is gone. The audit log keeps a description of what it was.",
      });
    } catch (error) {
      toast.error({
        title: "Could not delete that photo",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminCard
        index={index}
        title="Photographs"
        blurb={
          photos.length === 0
            ? "A car listing with no picture is not a listing, and publishing is refused until there is one."
            : "The first is the cover — the only picture of this car the storefront list shows. Drag is deliberately not how these move; use the arrows."
        }
        action={
          <AdminBadge tone={photos.length > 0 ? "green" : "coral"}>
            {photos.length === 0
              ? "None yet"
              : `${photos.length} of ${MAX_PHOTOS_PER_LISTING}`}
          </AdminBadge>
        }
      >
        <div className="flex min-w-0 flex-col gap-5">
          <UploadForm
            carListingId={carListingId}
            remaining={remaining}
            disabled={busy}
            onUploaded={(stored) => applyServerPhotos([...photos, ...stored])}
          />

          {photos.length === 0 ? (
            <AdminEmpty
              title="Nothing photographed yet"
              body={
                isPublished
                  ? "This car is on the site with no picture on it. That should not be possible — publishing checks for one — so add a photograph now."
                  : "Upload the pictures from the auction sheet or the yard. They appear here straight away, before the car is published: only an admin can see a draft's photographs."
              }
            />
          ) : (
            <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {photos.map((photo, position) => (
                <li key={photo.id} className="min-w-0">
                  <figure className="flex min-w-0 flex-col gap-2.5 rounded-[16px] border border-tm-border bg-card p-2.5">
                    <div
                      className={cn(
                        "relative aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-tm-tint",
                        photo.is_cover && "ring-2 ring-tm-coral/45",
                      )}
                    >
                      {/*
                        The relative `/api/cars/photos/<id>` straight from
                        `toCarPhotoView`. It must NOT go through `safeImageSrc`
                        (`features/app-home/components/format.ts`), which calls
                        `new URL(value)` and throws on a relative path — the
                        helper returns null and every photo here vanishes with no
                        error.

                        A PLAIN `img`, NOT `next/image`. The optimiser fetches
                        the source itself, server side, WITHOUT cookies, so it is
                        always an anonymous caller — and this route re-checks the
                        listing's publish state per request, which is what makes
                        a draft's photographs admin-only. Measured on the running
                        dev server: a draft's photo is 400 through
                        `/_next/image` and 200 fetched directly with the admin's
                        session. Since the entire job of this panel is looking at
                        a car BEFORE it is published, the optimiser is not an
                        option here. Same call, same reason, as the parcel-photo
                        panel.
                      */}
                      <img
                        src={photo.url}
                        alt={photo.alt}
                        width={photo.width}
                        height={photo.height}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 size-full object-cover"
                      />
                      {photo.is_cover ? (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-tm-coral px-2 py-1 text-[11px] leading-none font-bold text-white">
                          <StarIcon className="size-3" aria-hidden />
                          Cover
                        </span>
                      ) : null}
                    </div>

                    <figcaption className="flex min-w-0 flex-col gap-2">
                      <span className="tm-nums text-[11.5px] leading-none font-semibold text-tm-text-3">
                        {position + 1} of {photos.length} · {photo.width}×{photo.height}
                      </span>

                      <div className="flex flex-wrap items-center gap-1">
                        <IconButton
                          label={`Move ${photo.alt} earlier`}
                          disabled={busy || position === 0}
                          onClick={() => move(position, position - 1)}
                        >
                          <ArrowLeftIcon className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Move ${photo.alt} later`}
                          disabled={busy || position === photos.length - 1}
                          onClick={() => move(position, position + 1)}
                        >
                          <ArrowRightIcon className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={
                            photo.is_cover
                              ? "Already the cover"
                              : `Make this the cover photo`
                          }
                          disabled={busy || photo.is_cover}
                          onClick={() => makeCover(photo)}
                        >
                          <StarIcon className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Delete this photo`}
                          tone="danger"
                          disabled={busy}
                          onClick={() => setPendingDelete(photo)}
                        >
                          <Trash2Icon className="size-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminCard>

      <AdminConfirm
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this photograph?"
        consequence={
          pendingDelete?.is_cover
            ? "This is the cover, so the next picture takes its place on the storefront list. The file is deleted and cannot be recovered; the audit log keeps a description of what it was."
            : "The file is deleted and cannot be recovered. The audit log keeps a description of what it was."
        }
        detail={
          isPublished
            ? "This car is live, so the picture leaves its page the moment you confirm."
            : undefined
        }
        confirmLabel="Delete it"
        busy={busy}
        onConfirm={confirmDelete}
      />
    </>
  );
}

// ── Uploading ───────────────────────────────────────────────────────────────

function UploadForm({
  carListingId,
  remaining,
  disabled,
  onUploaded,
}: {
  carListingId: string;
  remaining: number;
  disabled: boolean;
  onUploaded: (stored: CarPhotoView[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [altText, setAltText] = useState("");
  const [sending, setSending] = useState(false);

  // What is about to be sent, before it is sent. An admin choosing eight frames
  // off a phone should see which eight.
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

  const busy = sending || disabled;
  const problem = describeSelection(files, remaining);

  function addFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    setFiles((current) => [...current, ...chosen]);
  }

  async function send() {
    if (problem || files.length === 0) {
      if (problem) toast.error({ title: "Not sent", description: problem });
      return;
    }

    setSending(true);
    try {
      const form = new FormData();
      // The field repeats; the route reads `form.getAll("file")`.
      for (const file of files) form.append("file", file);
      if (altText.trim()) form.append("alt_text", altText.trim());

      // NO `Content-Type` HEADER. The browser has to write the multipart
      // boundary itself, and naming the type by hand loses it — the same note
      // `useUploadOrderPhotos` carries.
      const response = await apiFetch<ApiSuccessResponse<{ photos: CarPhotoView[] }>>(
        `/api/admin/cars/${carListingId}/photos`,
        { method: "POST", body: form },
      );

      setFiles([]);
      setAltText("");
      onUploaded(response.data.photos);
      toast.success({
        title: response.data.photos.length === 1 ? "Photo added" : "Photos added",
        description:
          "Re-encoded and stored. Only an admin can see them until the car is published.",
      });
    } catch (error) {
      toast.error({
        title: "Could not upload that",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-display text-[14px] leading-none font-bold text-tm-ink">
          Add photographs
        </h3>
        <p className="max-w-[64ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          Up to {MAX_PHOTOS_PER_UPLOAD} at a time, {MAX_PHOTOS_PER_LISTING} on a listing.
          Each is re-encoded on the server, so nothing the file claims about itself is
          believed.
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/*
          Two pickers, for the reason the parcel panel gives: an input carrying
          `capture` opens the camera and nothing else, which is wrong on a laptop;
          an input without it never offers the camera on the phone that is the
          normal tool for photographing a car in a yard. The camera button is
          hidden above the phone breakpoint, where it would open a file dialog
          and lie about it.
        */}
        <PhotoPicker
          id={`car-camera-${carListingId}`}
          label="Take a photo"
          icon={<CameraIcon className="size-3.5" aria-hidden />}
          capture
          disabled={busy}
          onSelect={addFiles}
          className="sm:hidden"
        />
        <PhotoPicker
          id={`car-files-${carListingId}`}
          label="Choose photos"
          icon={<ImagePlusIcon className="size-3.5" aria-hidden />}
          multiple
          disabled={busy}
          onSelect={addFiles}
        />
        {files.length > 0 ? (
          <span className="text-[12px] leading-none font-semibold text-tm-text-3">
            {files.length} selected
          </span>
        ) : null}
      </div>

      {previews.length > 0 ? (
        <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5">
          {previews.map((preview, position) => (
            <li key={`${preview.file.name}-${position}`} className="relative min-w-0">
              {/*
                A plain `img`, not `next/image`: the src is a `blob:` URL for a
                file that has not been uploaded, so there is nothing for the
                optimiser to fetch and no path for `localPatterns` to allow. The
                parcel-photo panel does the same for the same reason.
              */}
              <img
                src={preview.url}
                alt={`Selected photo ${position + 1}, ${preview.file.name}`}
                className="aspect-square w-full rounded-[12px] border border-tm-border bg-tm-tint object-cover"
              />
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== position))}
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

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[12px] leading-none font-semibold text-tm-text-2">
          What these show (optional)
        </span>
        <input
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          maxLength={300}
          disabled={busy}
          placeholder="Nearside front, offside rear, interior…"
          className="h-10 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-[13px] text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/50 disabled:opacity-60"
        />
        <span className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
          Read aloud by a screen reader in place of the car&rsquo;s name. It applies to
          every photo in this batch.
        </span>
      </label>

      {problem ? (
        <p role="status" className="text-[12.5px] leading-[1.45] font-semibold text-tm-coral-strong">
          {problem}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AdminButton
          variant="primary"
          busy={sending}
          disabled={files.length === 0 || problem !== null || busy}
          onClick={send}
        >
          {files.length > 1 ? `Upload ${files.length} photos` : "Upload the photo"}
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
 * Why this batch will be refused, or null.
 *
 * Repeated from the route on purpose, so a bad selection fails HERE — before a
 * 12MB upload crosses a Ghanaian connection and comes back as a 413.
 */
function describeSelection(files: readonly File[], remaining: number): string | null {
  if (files.length === 0) return null;
  if (files.length > MAX_PHOTOS_PER_UPLOAD) {
    return `That is more than ${MAX_PHOTOS_PER_UPLOAD} photos at once. Send them in smaller batches.`;
  }
  if (files.length > remaining) {
    return remaining <= 0
      ? `This listing already holds ${MAX_PHOTOS_PER_LISTING} photos. Delete one before adding another.`
      : `There is room for ${remaining} more on this listing.`;
  }
  const tooBig = files.find((file) => file.size > MAX_UPLOAD_BYTES);
  if (tooBig) {
    return `“${tooBig.name}” is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`;
  }
  const notAnImage = files.find((file) => !file.type.startsWith("image/"));
  if (notAnImage) return `“${notAnImage.name}” is not an image.`;
  return null;
}

/**
 * A file input that looks like the rest of the admin.
 *
 * The input keeps its own focus and keyboard behaviour and is merely taken out
 * of the flow, rather than being replaced by a button that clicks it: the label
 * is the accessible name, the ring follows the real control, and the picker
 * opens from the keyboard. Its value is cleared after every pick so choosing the
 * same file twice still fires a change.
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

function IconButton({
  label,
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border border-tm-border bg-card transition-colors",
        "focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger"
          ? "text-tm-coral-strong hover:bg-tm-pill-bg"
          : "text-tm-text-2 hover:bg-tm-paper hover:text-tm-ink",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
