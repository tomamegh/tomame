"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { CaptionsIcon, CaptionsOffIcon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { CLIPS, clipSources, cueAt, type ClipKey, type GuideClip } from "../videos";

/**
 * A walkthrough clip in a device frame (081 guide).
 *
 * Plays muted and looped while it is on screen and pauses when it leaves, so a
 * page of eight clips costs one decoder at a time — unless the operator asked
 * for reduced motion, or paused it themselves, in which case it waits for them.
 * `preload="none"` means nothing downloads until a clip is first seen.
 *
 * The caption is drawn under the frame from the clip's cues (the same text as
 * its .vtt, which is attached for the browser's own captions and for screen
 * readers), and the full transcript sits in a disclosure below.
 */

export function GuideVideo({
  clip: key,
  className,
  size = "md",
  showTitle = true,
}: {
  clip: ClipKey;
  className?: string;
  size?: "sm" | "md";
  showTitle?: boolean;
}) {
  const clip: GuideClip = CLIPS[key];
  const src = clipSources(clip);
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [started, setStarted] = useState(false);

  // The native track is for assistive tech and fullscreen; the page draws its own.
  useEffect(() => {
    const track = videoRef.current?.textTracks[0];
    if (track) track.mode = "hidden";
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (!reduce && !userPaused.current) void video.play().catch(() => undefined);
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: [0, 0.55, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      void video.play().catch(() => undefined);
    } else {
      userPaused.current = true;
      video.pause();
    }
  };

  const restart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    userPaused.current = false;
    void video.play().catch(() => undefined);
  };

  const cue = cueAt(clip, time);
  const progress = clip.duration ? Math.min(1, time / clip.duration) : 0;
  const phone = clip.device === "phone";

  return (
    <figure className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        ref={wrapRef}
        className={cn(
          "group/video relative mx-auto w-full",
          phone ? (size === "sm" ? "max-w-[220px]" : "max-w-[272px]") : size === "sm" ? "max-w-[520px]" : "max-w-[720px]",
        )}
      >
        {phone ? (
          <div className="relative rounded-[40px] bg-tm-ink p-[9px] shadow-[0_30px_60px_-30px_rgba(43,36,34,0.65),inset_0_0_0_1.5px_rgba(255,255,255,0.08)]">
            <span className="absolute top-[18px] left-1/2 z-10 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <div className="relative overflow-hidden rounded-[32px] bg-tm-paper" style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
              <Video clip={clip} src={src} videoRef={videoRef} onTime={setTime} onPlaying={setPlaying} onStart={() => setStarted(true)} />
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-tm-border bg-card shadow-[0_30px_60px_-34px_rgba(43,36,34,0.55)]">
            <div className="flex h-9 items-center gap-3 border-b border-tm-hairline bg-tm-paper px-3.5" aria-hidden>
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[#f3b4a4]" />
                <span className="size-2.5 rounded-full bg-[#f5d9b0]" />
                <span className="size-2.5 rounded-full bg-[#bfe3cd]" />
              </span>
              <span className="min-w-0 flex-1 truncate rounded-full bg-card px-3 py-1 text-center font-mono text-[11px] text-tm-text-3">
                tomame.ca{clip.path}
              </span>
            </div>
            <div className="relative bg-tm-paper" style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
              <Video clip={clip} src={src} videoRef={videoRef} onTime={setTime} onPlaying={setPlaying} onStart={() => setStarted(true)} />
            </div>
          </div>
        )}

        {/* Controls sit on the frame, bottom left, and stay put for keyboards. */}
        <div className={cn("absolute flex items-center gap-1.5", phone ? "bottom-5 left-5" : "bottom-3 left-3")}>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? `Pause: ${clip.title}` : `Play: ${clip.title}`}
            className="flex size-10 items-center justify-center rounded-full bg-tm-ink/85 text-white shadow-[0_8px_18px_-8px_rgba(0,0,0,.6)] backdrop-blur transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-tm-coral/40 focus-visible:outline-none active:scale-95"
          >
            {playing ? <PauseIcon className="size-4 fill-current" aria-hidden /> : <PlayIcon className="ml-0.5 size-4 fill-current" aria-hidden />}
          </button>
          {started ? (
            <button
              type="button"
              onClick={restart}
              aria-label="Play from the start"
              className="flex size-8 items-center justify-center rounded-full bg-white/90 text-tm-ink opacity-0 shadow-[0_6px_14px_-8px_rgba(0,0,0,.5)] transition-opacity group-hover/video:opacity-100 focus-visible:opacity-100 focus-visible:ring-4 focus-visible:ring-tm-coral/40 focus-visible:outline-none"
            >
              <RotateCcwIcon className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        {/* Progress, a hairline along the bottom of the screen */}
        <div
          className={cn("pointer-events-none absolute h-[3px] overflow-hidden rounded-full bg-tm-ink/10", phone ? "inset-x-[26px] bottom-[14px]" : "inset-x-0 bottom-0 rounded-none")}
          aria-hidden
        >
          <div className="h-full origin-left bg-[image:var(--tm-gradient-cta)]" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>

      <figcaption className={cn("mx-auto flex w-full flex-col gap-2", phone ? "max-w-[320px]" : "max-w-[720px]")}>
        <div className="flex items-start gap-2">
          <p
            className="min-h-[2.9em] flex-1 text-[13px] leading-[1.45] font-medium text-tm-text-2"
            aria-live={playing ? "off" : "polite"}
          >
            {showTitle ? <span className="font-semibold text-tm-ink">{clip.title}. </span> : null}
            {captions ? (cue?.text ?? clip.cues[0]?.text) : null}
          </p>
          <button
            type="button"
            onClick={() => setCaptions((c) => !c)}
            aria-pressed={captions}
            aria-label={captions ? "Hide captions" : "Show captions"}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-tm-hairline hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none"
          >
            {captions ? <CaptionsIcon className="size-4" aria-hidden /> : <CaptionsOffIcon className="size-4" aria-hidden />}
          </button>
        </div>
        <details className="group/tr text-[12.5px] text-tm-text-3">
          <summary className="w-fit cursor-pointer list-none font-semibold text-tm-text-3 transition-colors hover:text-tm-ink [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-tm-border underline-offset-4 group-open/tr:hidden">Read the transcript</span>
            <span className="hidden underline decoration-tm-border underline-offset-4 group-open/tr:inline">Hide the transcript</span>
          </summary>
          <ol className="mt-2 flex flex-col gap-1.5 border-l-2 border-tm-hairline pl-3">
            {clip.cues.map((c) => (
              <li key={c.from} className={cn("leading-[1.45]", cue === c && "font-semibold text-tm-ink")}>
                <span className="tm-nums mr-1.5 font-mono text-[11px] text-tm-text-3">0:{String(Math.floor(c.from)).padStart(2, "0")}</span>
                {c.text}
              </li>
            ))}
          </ol>
        </details>
      </figcaption>
    </figure>
  );
}

function Video({
  clip,
  src,
  videoRef,
  onTime,
  onPlaying,
  onStart,
}: {
  clip: GuideClip;
  src: ReturnType<typeof clipSources>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTime: (t: number) => void;
  onPlaying: (p: boolean) => void;
  onStart: () => void;
}) {
  return (
    <video
      ref={videoRef}
      className="absolute inset-0 size-full object-cover"
      poster={src.poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={`${clip.title}, a ${Math.round(clip.duration)}-second screen recording of the warehouse app`}
      onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
      onPlay={() => {
        onPlaying(true);
        onStart();
      }}
      onPause={() => onPlaying(false)}
    >
      <source src={src.mp4} type="video/mp4" />
      <track kind="captions" srcLang="en" label="English" src={src.captions} default />
    </video>
  );
}
