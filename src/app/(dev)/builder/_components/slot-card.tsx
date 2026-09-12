"use client";

import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  CheckCircle,
  FloppyDisk,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import {
  BuilderRequestError,
  resetSlot,
  saveCrop,
  uploadImage,
} from "../_lib/builder-api";
import {
  clampPercent,
  coverOverflow,
  cropsEqual,
  dragCrop,
  formatCrop,
  parseCrop,
  type CropPoint,
} from "../_lib/crop";
import type { SlotFrame } from "../_lib/slot-frames";

/** Everything the server resolved for one slot. Plain data — no DB row shapes. */
export interface BuilderSlot {
  readonly key: string;
  /** What the photo is for. The brief a replacement has to match. */
  readonly shot: string;
  /** Image currently served for this slot: uploaded if there is one. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** Stored crop, or the manifest default. */
  readonly position: string;
  readonly alt: string;
  /** True when an admin upload is being served rather than the shipped file. */
  readonly uploaded: boolean;
  /** Set when the crop or alt differs from the manifest, upload or not. */
  readonly overridden: boolean;
  readonly frames: readonly SlotFrame[];
}

type Status =
  | { kind: "idle" }
  | { kind: "busy"; scope: "save" | "reset" | "upload"; message: string }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const MAX_UPLOAD_MB = 12;

/**
 * Tallest the preview is allowed to get.
 *
 * The frame has to keep the real box's aspect ratio exactly — that is the whole
 * point — so it is capped by constraining the WIDTH, never the height. A 3:4
 * hero given the full column would be 750px tall and push its own controls off
 * screen.
 */
const MAX_PREVIEW_HEIGHT = 340;

export function SlotCard({ slot }: { slot: BuilderSlot }) {
  const router = useRouter();
  const sliderId = useId();
  const altId = useId();
  const fileId = useId();

  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    origin: CropPoint;
    overflow: CropPoint;
  } | null>(null);

  const [frame, setFrame] = useState<SlotFrame>(slot.frames[0]!);
  const [crop, setCrop] = useState<CropPoint>(() => parseCrop(slot.position));
  const [savedCrop, setSavedCrop] = useState<CropPoint>(() =>
    parseCrop(slot.position),
  );
  const [alt, setAlt] = useState(slot.alt);
  const [savedAlt, setSavedAlt] = useState(slot.alt);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState(0);
  const [dropActive, setDropActive] = useState(false);

  /** Local preview of a just-picked file, shown before the round trip. */
  const [pending, setPending] = useState<{ url: string; name: string } | null>(
    null,
  );
  /**
   * Natural size of whatever is on screen. Starts from the stored dimensions
   * and is corrected on load, because a locally-picked file's size is unknown
   * until the browser decodes it.
   */
  const [natural, setNatural] = useState({
    width: slot.width,
    height: slot.height,
  });

  // A blob URL leaks its buffer until revoked, and this card can pick a new
  // file many times in a sitting.
  useEffect(() => {
    if (!pending) return;
    const { url } = pending;
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const busy = status.kind === "busy";
  const dirty = !cropsEqual(crop, savedCrop) || alt.trim() !== savedAlt.trim();

  // Ratio comparison, so the hint is right before the frame has been measured.
  const frameRatio = frame.width / frame.height;
  const imageRatio = natural.width / natural.height;
  const canMoveY = imageRatio < frameRatio - 0.001;
  const canMoveX = imageRatio > frameRatio + 0.001;

  const displaySrc = pending?.url ?? slot.src;

  // ── Drag ──────────────────────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || busy) return;
      const element = frameRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const overflow = coverOverflow(rect, natural);
      if (overflow.x <= 0 && overflow.y <= 0) return;

      element.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: crop,
        overflow,
      };
      setDragging(true);
      event.preventDefault();
    },
    [busy, crop, natural],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCrop(
      dragCrop(
        drag.origin,
        { dx: event.clientX - drag.x, dy: event.clientY - drag.y },
        drag.overflow,
      ),
    );
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    frameRef.current?.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSave() {
    setStatus({ kind: "busy", scope: "save", message: "Saving crop…" });
    try {
      const trimmed = alt.trim();
      const altChanged = Boolean(trimmed) && trimmed !== savedAlt.trim();
      await saveCrop(slot.key, {
        position: formatCrop(crop),
        ...(altChanged ? { alt: trimmed } : {}),
      });
      setSavedCrop(crop);
      if (altChanged) setSavedAlt(trimmed);
      setStatus({ kind: "ok", message: `Saved ${formatCrop(crop)}.` });
    } catch (error) {
      setStatus({ kind: "error", message: describe(error) });
    }
  }

  async function handleReset() {
    setStatus({ kind: "busy", scope: "reset", message: "Restoring the default…" });
    try {
      await resetSlot(slot.key);
      setPending(null);
      setStatus({ kind: "ok", message: "Override removed." });
      router.refresh();
    } catch (error) {
      setStatus({ kind: "error", message: describe(error) });
    }
  }

  async function handleFile(file: File) {
    setStatus({ kind: "idle" });
    setProgress(0);
    setPending({ url: URL.createObjectURL(file), name: file.name });

    // The server rejects this too; catching it here saves pushing megabytes
    // up the wire only to be told no.
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setStatus({
        kind: "error",
        message: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_UPLOAD_MB}MB.`,
      });
      return;
    }

    setStatus({ kind: "busy", scope: "upload", message: "Uploading…" });
    try {
      const { override } = await uploadImage(slot.key, file, setProgress);
      setPending(null);
      setStatus({
        kind: "ok",
        message: `Stored as ${override.width}×${override.height} WebP.`,
      });
      router.refresh();
    } catch (error) {
      setPending(null);
      setStatus({ kind: "error", message: describe(error) });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <article
      className="flex flex-col gap-5 rounded-3xl border border-tm-border bg-card p-5 md:p-6"
      aria-labelledby={`${slot.key}-heading`}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id={`${slot.key}-heading`}
            className="font-mono text-sm font-semibold"
          >
            {slot.key}
          </h2>
          <Badge tone={slot.uploaded ? "green" : "muted"}>
            {slot.uploaded ? "Uploaded" : "Shipped default"}
          </Badge>
          {slot.overridden && !slot.uploaded ? (
            <Badge tone="amber">Crop override</Badge>
          ) : null}
        </div>
        <p className="text-sm text-tm-text-2">{slot.shot}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Preview ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {slot.frames.length > 1 ? (
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Preview this slot at the size it renders"
            >
              {slot.frames.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setFrame(option)}
                  aria-pressed={option.label === frame.label}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30",
                    option.label === frame.label
                      ? "border-tm-coral bg-tm-tint text-tm-coral-strong"
                      : "border-tm-border bg-tm-paper text-tm-text-2 hover:border-tm-coral/40",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            data-testid={`frame-${slot.key}`}
            style={{
              aspectRatio: `${frame.width} / ${frame.height}`,
              maxWidth: (frame.width / frame.height) * MAX_PREVIEW_HEIGHT,
            }}
            className={cn(
              "relative w-full touch-none overflow-hidden rounded-2xl bg-tm-tint select-none",
              canMoveX || canMoveY
                ? dragging
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-default",
            )}
          >
            {pending ? (
              /* A blob: URL cannot go through the image optimiser, and this is
                 a throwaway preview of bytes the server has not seen yet. */
              <img
                src={pending.url}
                alt=""
                draggable={false}
                onLoad={(event) =>
                  setNatural({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                style={{ objectPosition: formatCrop(crop) }}
                className="size-full object-cover"
              />
            ) : (
              <NextImage
                key={slot.src}
                src={slot.src}
                alt={slot.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 480px"
                draggable={false}
                onLoad={(event) =>
                  setNatural({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                style={{ objectPosition: formatCrop(crop) }}
                className="object-cover"
              />
            )}

            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold"
            >
              <ArrowsOutCardinal weight="bold" className="size-3" />
              {frame.width}×{frame.height}
            </span>
          </div>

          <p className="text-xs text-tm-text-3">
            {canMoveY
              ? "Drag the photo to move the crop, or use the slider."
              : canMoveX
                ? "This box is taller than the photo — only the horizontal crop moves here."
                : "The photo matches this box exactly, so the crop has nothing to move."}
          </p>
        </div>

        {/* ── Controls ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={sliderId}>Vertical crop</Label>
              <output
                htmlFor={sliderId}
                className="font-mono text-xs font-semibold text-tm-text-2"
              >
                {formatCrop(crop)}
              </output>
            </div>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={crop.y}
              disabled={busy || !canMoveY}
              aria-describedby={`${sliderId}-hint`}
              onChange={(event) =>
                setCrop((current) => ({
                  ...current,
                  y: clampPercent(Number(event.target.value)),
                }))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-tm-hairline accent-tm-coral outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p
              id={`${sliderId}-hint`}
              className="flex justify-between text-[11px] text-tm-text-3"
            >
              <span>0% · top of the photo</span>
              <span>100% · bottom</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={altId}>Alt text</Label>
            <Input
              id={altId}
              value={alt}
              disabled={busy}
              maxLength={300}
              onChange={(event) => setAlt(event.target.value)}
              className="text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              disabled={busy || !dirty}
              aria-busy={status.kind === "busy" && status.scope === "save"}
            >
              {status.kind === "busy" && status.scope === "save" ? (
                <Spinner />
              ) : (
                <FloppyDisk weight="bold" />
              )}
              Save crop
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || !slot.overridden}
                >
                  <ArrowCounterClockwise weight="bold" />
                  Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset {slot.key}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {slot.uploaded
                      ? "This permanently deletes the uploaded photo and restores the one shipped with the build. It cannot be undone — you would have to upload the file again."
                      : "This removes the saved crop and alt text, restoring the values shipped with the build."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleReset}>
                    Reset to default
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {dirty ? (
              <span className="text-xs font-semibold text-tm-amber">
                Unsaved
              </span>
            ) : null}
          </div>

          {/* ── Upload ──────────────────────────────────────────────── */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border border-dashed p-4 transition-colors",
              dropActive
                ? "border-tm-coral bg-tm-tint"
                : "border-tm-border bg-tm-paper",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <UploadSimple weight="bold" className="size-4 text-tm-text-2" />
              <span className="text-sm font-semibold">Replace photo</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </Button>
            </div>
            <p className="text-xs text-tm-text-3">
              Drop an image here, or choose one. JPEG, PNG, WebP, AVIF or TIFF,
              up to {MAX_UPLOAD_MB}MB and at least 200px on both sides. It is
              re-encoded to WebP and stripped of EXIF on the way in.
            </p>
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`Replacement photo for ${slot.key}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />

            {status.kind === "busy" && progress > 0 && progress < 1 ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-tm-hairline"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-tm-coral transition-[width] duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>

          <StatusLine status={status} pendingName={pending?.name} />

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-tm-text-3">
            <dt>Serving</dt>
            <dd className="truncate font-mono">{displaySrc}</dd>
            <dt>Stored size</dt>
            <dd className="font-mono">
              {slot.width}×{slot.height}
            </dd>
          </dl>
        </div>
      </div>
    </article>
  );
}

function StatusLine({
  status,
  pendingName,
}: {
  status: Status;
  pendingName?: string;
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex min-h-5 items-start gap-1.5 text-xs font-medium",
        status.kind === "error" && "text-tm-coral-strong",
        status.kind === "ok" && "text-tm-green-ink",
        status.kind === "busy" && "text-tm-text-2",
        status.kind === "idle" && "text-tm-text-3",
      )}
    >
      {status.kind === "error" ? (
        <WarningCircle weight="fill" className="mt-px size-3.5 shrink-0" />
      ) : null}
      {status.kind === "ok" ? (
        <CheckCircle weight="fill" className="mt-px size-3.5 shrink-0" />
      ) : null}
      {status.kind === "busy" ? <Spinner className="mt-px size-3.5 shrink-0" /> : null}
      <span>
        {status.kind === "idle"
          ? pendingName
            ? `${pendingName} selected.`
            : ""
          : status.message}
      </span>
    </p>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone === "green" && "bg-tm-green-bg text-tm-green-ink",
        tone === "amber" && "bg-tm-amber-bg text-tm-amber",
        tone === "muted" && "bg-tm-tint text-tm-text-2",
      )}
    >
      {children}
    </span>
  );
}

/** Server messages win; only a genuinely unknown throw gets a generic line. */
function describe(error: unknown): string {
  if (error instanceof BuilderRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
