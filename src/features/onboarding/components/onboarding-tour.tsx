"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth/api-helpers";
import { shouldShowOnboardingTour } from "../tour-predicate";
import { buildOnboardingTourSteps, type OnboardingTourStep } from "../steps";
import type { OnboardingSignals } from "../services/onboarding-state.service";

export interface OnboardingTourProps {
  signals: OnboardingSignals;
}

/** Matches the bottom tab bar's own breakpoint (`lg:hidden` on `AppBottomTabs`). */
const DESKTOP_QUERY = "(min-width: 1024px)";

/** The tab bar's reserved height on a phone — `tm-clear-tab-bar` in globals.css, restated in pixels for JS math. */
const MOBILE_TAB_BAR_HEIGHT = 96;

const EDGE_MARGIN = 12;
const TARGET_PADDING = 8;
const TOOLTIP_GAP = 16;
const MAX_CARD_WIDTH = 360;
const TARGET_WAIT_ATTEMPTS = 40;
const TARGET_WAIT_INTERVAL_MS = 50;

function localStorageKey(userId: string): string {
  return `tm_onboarding_tour:${userId}`;
}

/** The extra, non-authoritative guard against a flash — see migration 064 and tour-predicate.ts. */
function readLocalTourStatus(userId: string): "completed" | "dismissed" | null {
  try {
    const value = window.localStorage.getItem(localStorageKey(userId));
    return value === "completed" || value === "dismissed" ? value : null;
  } catch {
    return null;
  }
}

function writeLocalTourStatus(userId: string, status: "completed" | "dismissed"): void {
  try {
    window.localStorage.setItem(localStorageKey(userId), status);
  } catch {
    // Private browsing, storage disabled, or a full quota — the server write is
    // the source of truth regardless, so a failed local write changes nothing
    // except losing the same-tab flash guard for this one visit.
  }
}

/** The safe-area inset, read once from a probe element rather than guessed. */
function useSafeAreaInsetBottom(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.bottom = "0";
    probe.style.height = "0";
    probe.style.paddingBottom = "env(safe-area-inset-bottom)";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    setInset(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
    document.body.removeChild(probe);
  }, []);
  return inset;
}

function useIsDesktopNav(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rectFromElement(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

interface Placement {
  top: number;
  left: number;
  width: number;
  /** Which edge of the card the arrow sits on — the opposite of where the target is. */
  arrowEdge: "top" | "bottom";
  arrowLeft: number;
}

/**
 * The signed-in customer's four-stop welcome tour — Kelvin's brief: a
 * first-time greeting folded into stop one, then a small pointer-and-card walk
 * through the ask, the landed price, the bag and the journey.
 *
 * Mounted once in `src/app/app/layout.tsx`, next to the bottom tab bar. This
 * component owns two separate concerns on purpose:
 *
 * 1. **Whether to START.** `shouldShowOnboardingTour` (pure, exhaustively
 *    tested) decides this from server-resolved `signals` plus the live route —
 *    checked on mount and on every route change, but only until a start
 *    happens or `signals` already rules it out for good.
 * 2. **Running the tour once started.** From here on the pure predicate is not
 *    consulted again — stop 3 deliberately navigates to `/app/bag`, which the
 *    predicate itself refuses to START on, and that refusal must not cancel a
 *    tour already under way.
 */
export function OnboardingTour({ signals }: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const isDesktop = useIsDesktopNav();
  const safeAreaBottom = useSafeAreaInsetBottom();

  const steps = useRef<OnboardingTourStep[]>(buildOnboardingTourSteps(signals.firstName)).current;

  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // Locks the START decision the moment it fires either way — a start, or a
  // localStorage guard already saying this viewer is done. Prevents the entry
  // effect from re-evaluating (and, worse, re-starting) once the tour's own
  // navigation begins visiting routes the entry predicate would refuse.
  const settledRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const currentStep = isActive ? steps[stepIndex] : null;

  const finish = useCallback(
    (status: "completed" | "dismissed") => {
      setIsActive(false);
      setRect(null);
      setPlacement(null);
      if (signals.userId) {
        writeLocalTourStatus(signals.userId, status);
        apiFetch("/api/app/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }).catch(() => {
          // Best-effort. A failed write means a reload could show the tour
          // again — acceptable degradation, and far better than blocking the
          // close button on a network round trip.
        });
      }
    },
    [signals.userId],
  );

  const dismiss = useCallback(() => finish("dismissed"), [finish]);

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      finish("completed");
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, finish]);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // ── 1. Should the tour start? ────────────────────────────────────────────
  useEffect(() => {
    if (settledRef.current || isActive) return;

    if (signals.userId && readLocalTourStatus(signals.userId)) {
      settledRef.current = true;
      return;
    }

    const shouldStart = shouldShowOnboardingTour({
      tourEnabled: signals.tourEnabled,
      isAuthenticated: signals.isAuthenticated,
      pathname,
      hasPaymentReturnParam: searchParams.has("payment"),
      onboardingCompletedAt: signals.onboardingCompletedAt,
      onboardingDismissedAt: signals.onboardingDismissedAt,
    });

    if (shouldStart) {
      settledRef.current = true;
      setStepIndex(0);
      setIsActive(true);
    }
  }, [pathname, searchParams, signals, isActive]);

  // ── 2. Navigate to the current step's route if we are not already there. ──
  useEffect(() => {
    if (!currentStep) return;
    const normalised =
      pathname && pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    if (normalised !== currentStep.route) {
      router.push(currentStep.route);
    }
  }, [currentStep, pathname, router]);

  // ── 3. Once on the right route, find the target and measure it. ─────────
  useEffect(() => {
    if (!currentStep) return;
    const normalised =
      pathname && pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    if (normalised !== currentStep.route) return;

    let cancelled = false;
    let attempts = 0;
    setRect(null);

    function measure() {
      if (cancelled || !currentStep) return;
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        el.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "center",
        });
        requestAnimationFrame(() => {
          if (!cancelled) setRect(rectFromElement(el));
        });
        return;
      }
      attempts += 1;
      if (attempts > TARGET_WAIT_ATTEMPTS) return;
      setTimeout(measure, TARGET_WAIT_INTERVAL_MS);
    }
    measure();

    return () => {
      cancelled = true;
    };
  }, [currentStep, pathname, shouldReduceMotion]);

  // ── 4. Keep the measurement current across scroll and resize. ───────────
  useEffect(() => {
    if (!currentStep) return;
    function onReflow() {
      if (!currentStep) return;
      const el = document.getElementById(currentStep.targetId);
      if (el) setRect(rectFromElement(el));
    }
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [currentStep]);

  // ── 5. Position the card once the target and its own size are known. ────
  useLayoutEffect(() => {
    if (!rect) {
      setPlacement(null);
      return;
    }
    // The card still keeps clear of the tab bar's strip on a phone. The bar is
    // dimmed rather than hidden, and a card sitting on top of it would put the
    // tour's own buttons where the customer's thumb expects navigation.
    const tabBarClearance = isDesktop ? 0 : MOBILE_TAB_BAR_HEIGHT + safeAreaBottom;
    const usableTop = EDGE_MARGIN;
    const usableBottom = window.innerHeight - tabBarClearance - EDGE_MARGIN;
    const cardWidth = Math.min(MAX_CARD_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
    const cardHeight = cardRef.current?.offsetHeight ?? 200;

    const spaceBelow = usableBottom - (rect.top + rect.height + TARGET_PADDING + TOOLTIP_GAP);
    const spaceAbove = rect.top - TARGET_PADDING - TOOLTIP_GAP - usableTop;
    const placeBelow = spaceBelow >= cardHeight || spaceBelow >= spaceAbove;

    let top = placeBelow
      ? rect.top + rect.height + TARGET_PADDING + TOOLTIP_GAP
      : rect.top - TARGET_PADDING - TOOLTIP_GAP - cardHeight;
    top = Math.min(Math.max(top, usableTop), Math.max(usableTop, usableBottom - cardHeight));

    let left = rect.left + rect.width / 2 - cardWidth / 2;
    left = Math.min(Math.max(left, EDGE_MARGIN), window.innerWidth - cardWidth - EDGE_MARGIN);

    const arrowLeft = Math.min(
      Math.max(rect.left + rect.width / 2 - left, 20),
      cardWidth - 20,
    );

    setPlacement({
      top,
      left,
      width: cardWidth,
      arrowEdge: placeBelow ? "top" : "bottom",
      arrowLeft,
    });
    // Re-run once the card's own height is known (first pass uses a fallback).
  }, [rect, isDesktop, safeAreaBottom, stepIndex]);

  // ── 5b. Tell the rest of the app to stand down while the tour is up. ────
  //
  // The install prompt (`src/features/pwa`) is a fixed card at z-60 that
  // invites the customer to add Tomame to their home screen. It is worth
  // showing, but not on top of a tour that is pointing at something else:
  // Kelvin caught it sitting inside the spotlight, over the very card stop two
  // was highlighting. A data attribute on the document is the lightest contract
  // that works for any such overlay, current or future, without this component
  // needing to know one exists. The matching rule lives in `globals.css`.
  useEffect(() => {
    if (!isActive) return;
    document.documentElement.dataset.tmTour = "active";
    return () => {
      delete document.documentElement.dataset.tmTour;
    };
  }, [isActive]);

  // ── 6. Escape closes it; Tab is never intercepted. ───────────────────────
  useEffect(() => {
    if (!isActive) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isActive, dismiss]);

  // Announce each new stop to screen reader users without trapping focus —
  // the heading is focusable but nothing about Tab order changes.
  useEffect(() => {
    if (isActive) titleRef.current?.focus();
  }, [isActive, stepIndex]);

  if (!isActive || !currentStep || !rect || !placement) return null;

  const isLastStep = stepIndex === steps.length - 1;
  // THE DIM REACHES THE BOTTOM OF THE SCREEN, tab bar included. It used to
  // stop short of the tab bar to keep it lit, and on a real phone that read as
  // a bug: every other pixel dimmed and the bar glowing underneath, as if the
  // tour had failed to cover it. Kelvin: "put the menu bar behind when
  // displaying the tour, everything should be behind". The bar is z-50 and this
  // overlay is z-100, so covering it needs nothing but the height.
  const dimBottom = window.innerHeight;

  const spotTop = rect.top - TARGET_PADDING;
  const spotLeft = rect.left - TARGET_PADDING;
  const spotWidth = rect.width + TARGET_PADDING * 2;
  const spotHeight = rect.height + TARGET_PADDING * 2;

  const transitionStyle = { transition: "top 300ms var(--tm-ease), left 300ms var(--tm-ease), width 300ms var(--tm-ease), height 300ms var(--tm-ease)" } as const;

  return (
    <div className="fixed inset-0 z-[100]">
      {/*
        Four bands frame the spotlight instead of dimming the target — never
        the whole viewport in one box-shadow trick, which would either block
        every click under it or (with pointer-events:none) block none of them.
        Each band stops at `dimBottom`, which is the full height of the
        viewport: nothing on the page stays lit except the spotlight itself.
      */}
      <div
        className="pointer-events-none absolute bg-tm-ink/55"
        style={{ top: 0, left: 0, width: "100%", height: Math.max(0, spotTop), ...transitionStyle }}
      />
      <div
        className="pointer-events-none absolute bg-tm-ink/55"
        style={{
          top: Math.min(spotTop + spotHeight, dimBottom),
          left: 0,
          width: "100%",
          height: Math.max(0, dimBottom - (spotTop + spotHeight)),
          ...transitionStyle,
        }}
      />
      <div
        className="pointer-events-none absolute bg-tm-ink/55"
        style={{
          top: Math.max(0, spotTop),
          left: 0,
          width: Math.max(0, spotLeft),
          height: Math.max(0, Math.min(spotHeight, dimBottom - spotTop)),
          ...transitionStyle,
        }}
      />
      <div
        className="pointer-events-none absolute bg-tm-ink/55"
        style={{
          top: Math.max(0, spotTop),
          left: spotLeft + spotWidth,
          width: Math.max(0, window.innerWidth - (spotLeft + spotWidth)),
          height: Math.max(0, Math.min(spotHeight, dimBottom - spotTop)),
          ...transitionStyle,
        }}
      />

      {/* The ring around the spotlighted element. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-2xl ring-2 ring-tm-coral ring-offset-2 ring-offset-transparent"
        style={{ top: spotTop, left: spotLeft, width: spotWidth, height: spotHeight, ...transitionStyle }}
      />

      {/*
        NO AnimatePresence, deliberately. It was wrapping this card with
        `mode="wait"`, which holds the incoming step back until the outgoing one
        has finished its exit animation. When frames are throttled — a
        backgrounded tab, a phone in low power mode — that exit never finishes,
        so the next step never mounts and the tour simply disappears mid-walk
        with no way back. Reproduced: pressing Next left no card on screen at
        all. A keyed remount needs no exit, cannot be gated on one, and is
        instant.
      */}
      <motion.div
          key={currentStep.id}
          ref={cardRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="onboarding-tour-title"
          aria-describedby="onboarding-tour-body"
          className="pointer-events-auto absolute rounded-[20px] border border-tm-border bg-card p-5 shadow-[0_16px_56px_-8px_rgba(43,36,34,0.22)]"
          style={{ top: placement.top, left: placement.left, width: placement.width }}
          // NOTHING HERE ANIMATES OPACITY, deliberately. The card used to fade
          // in, and a fade is only ever as reliable as the frames it gets: a
          // backgrounded tab, a phone in low power mode or a browser that
          // throttles requestAnimationFrame freezes the tween wherever it
          // stopped. Caught at rest with a computed opacity of 0.74, which puts
          // the page's own text straight through the card and makes the copy
          // unreadable. Movement alone is safe, because a frozen transform is
          // still a perfectly legible card that is a few pixels out of place.
          initial={shouldReduceMotion ? false : { y: placement.arrowEdge === "top" ? 8 : -8 }}
          animate={{ y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* The arrow — a rotated square peeking out of the edge nearest the target. */}
          <div
            aria-hidden
            className="absolute h-3 w-3 rotate-45 border border-tm-border bg-card"
            style={
              placement.arrowEdge === "top"
                ? { top: -7, left: placement.arrowLeft - 6, borderRight: "none", borderBottom: "none" }
                : { bottom: -7, left: placement.arrowLeft - 6, borderLeft: "none", borderTop: "none" }
            }
          />

          <button
            type="button"
            onClick={dismiss}
            aria-label="Close tour"
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-tm-text-3 outline-none transition-colors hover:bg-tm-tint hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40"
          >
            <X weight="bold" className="size-4" aria-hidden />
          </button>

          <p className="pr-8 text-xs leading-none font-semibold tracking-wide text-tm-coral uppercase">
            Step {stepIndex + 1} of {steps.length}
          </p>

          <h2
            id="onboarding-tour-title"
            ref={titleRef}
            tabIndex={-1}
            className="mt-2 pr-8 font-display text-[19px] leading-tight font-bold text-tm-ink outline-none"
          >
            {currentStep.title}
          </h2>

          <p id="onboarding-tour-body" className="mt-2 text-[14px] leading-[1.5] text-tm-text-2">
            {currentStep.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-1.5" aria-hidden>
              {steps.map((step, i) => (
                <span
                  key={step.id}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-colors",
                    i === stepIndex ? "bg-tm-coral" : "bg-tm-border",
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 outline-none transition-colors hover:bg-tm-tint hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40"
                >
                  <ArrowLeft weight="bold" className="size-3.5" aria-hidden />
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                className="tm-cta-gradient flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-tm-coral/40 active:scale-[0.99]"
              >
                {isLastStep ? "Got it, thanks" : "Next"}
                {!isLastStep && <ArrowRight weight="bold" className="size-3.5" aria-hidden />}
              </button>
            </div>
          </div>
      </motion.div>
    </div>
  );
}
