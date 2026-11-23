"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, Copy, FingerprintSimple } from "@phosphor-icons/react";

import { copyText, haptic, onAppResume } from "@/lib/native/bridge";
import { toast } from "@/lib/sonner";

/**
 * Pull down at the top of a server screen to re-read it (`router.refresh()`), with a medium
 * haptic when the pull is far enough. Also refreshes when the app comes back to the foreground.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pull, setPull] = useState(0);
  const y0 = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => onAppResume(() => start(() => router.refresh())), [router]);

  useEffect(() => {
    const down = (e: TouchEvent) => {
      y0.current = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
      armed.current = false;
    };
    const move = (e: TouchEvent) => {
      if (y0.current == null) return;
      const d = Math.max(0, (e.touches[0]?.clientY ?? 0) - y0.current);
      setPull(d);
      if (d > 90 && !armed.current) {
        armed.current = true;
        haptic("medium");
      }
    };
    const up = () => {
      if (y0.current == null) return;
      y0.current = null;
      setPull(0);
      if (armed.current) start(() => router.refresh());
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [router]);

  const k = Math.min(pull / 90, 1);
  return (
    <div className={pending ? "ptr go" : "ptr"} aria-hidden>
      <span
        className="spin"
        style={{
          opacity: pending ? 1 : k,
          transform: pending ? "translateY(18px)" : `translateY(${Math.min(pull * 0.5, 50)}px) rotate(${pull * 3}deg) scale(${0.6 + 0.4 * k})`,
        }}
      >
        <ArrowsClockwise size={17} weight="bold" />
      </span>
    </div>
  );
}

/** A tap-to-copy value (the tracking number), with a light haptic and a toast. */
export function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      className="card"
      onClick={() => {
        haptic("light");
        void copyText(value).then(() => toast.success({ title: `Copied ${value}` }));
      }}
    >
      <small>{label}</small>
      <b className="nums">{value} <Copy size={15} color="var(--m-text-3)" /></b>
    </button>
  );
}

/** The delivery code, blurred until the customer holds the button (light haptic, then success when shown). */
export function DeliveryCode({ code, rider }: { code: string; rider: string | null }) {
  const [shown, setShown] = useState(false);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  const start = () => {
    haptic("light");
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 600);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else {
        setShown(true);
        haptic("success");
      }
    };
    raf.current = requestAnimationFrame(step);
  };
  const stop = () => {
    cancelAnimationFrame(raf.current);
    setProgress(0);
    setShown(false);
  };

  return (
    <div className={shown ? "card code-card reveal" : "card code-card"}>
      <span className="eyebrow coral">Delivery code</span>
      <div className="digits nums" aria-hidden={!shown}>
        {code.split("").map((d, i) => (
          <span key={i}>{shown ? d : "•"}</span>
        ))}
      </div>
      <small className="muted">Give it to {rider ?? "your rider"} at the door, never before.</small>
      <button
        type="button"
        className="hold"
        style={{ ["--hp" as string]: progress }}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <FingerprintSimple size={18} weight="bold" />
        <span>{shown ? "Showing · let go to hide" : "Hold to show"}</span>
      </button>
    </div>
  );
}
