"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Export, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  INSTALL_DISMISSED_FOREVER,
  INSTALL_DISMISSED_KEY,
  isDismissalActive,
  isIosInstallCapable,
  isMobileInstallContext,
  isPromptableRoute,
  isStandalone,
} from "../lib/install-state";

/**
 * The event Chromium fires when it decides a site is installable. It is not in
 * TypeScript's DOM library, because no other engine implements it.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Nothing may appear in the first few seconds. A card that slides up while the
 * page is still settling reads as an ad, not as an offer.
 */
const MIN_DWELL_MS = 5_000;

/** …and it should not wait forever for a scroll that may never come. */
const MAX_WAIT_MS = 22_000;

/** Scrolling this far past the fold is the signal that someone is interested. */
const SCROLL_TRIGGER_VH = 0.6;

/**
 * "Install Tomame" — the card that turns a visitor into someone with an icon on
 * their home screen.
 *
 * Two entirely different mechanisms behind one piece of UI:
 *
 *   - **Chromium (Android).** The browser fires `beforeinstallprompt` once it
 *     considers the site installable. We call `preventDefault()` to suppress
 *     the browser's own mini-infobar, keep the event, and fire it from our own
 *     button — which puts the ask in our words at a moment we choose.
 *   - **iOS.** Safari has no such event and no programmatic install, so there
 *     is nothing to fire: the only route is Share → Add to Home Screen. The
 *     card shows those two steps instead of a button, which is the entire
 *     reason iOS installs are rare — nobody knows the gesture exists.
 *
 * **Where it is allowed to appear** is as much of the design as the card
 * itself. It shows on a phone or tablet only, marketing pages very much
 * included — a visitor reading the pitch on their phone is the person most
 * worth asking. It stays away from sign-in, quote review, the bag and the admin
 * console (`isPromptableRoute`), never appears in the already-installed app,
 * and waits for either a real scroll or a long dwell before it says a word.
 * A "no" is remembered for a fortnight; an install, forever.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const remember = useCallback((value: string) => {
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, value);
    } catch {
      // Private mode, or storage disabled. The prompt simply returns next time,
      // which is a far better failure than a crash on a shopping page.
    }
  }, []);

  useEffect(() => {
    // Already installed, or not a device this app is built for.
    if (isStandalone() || !isMobileInstallContext()) return;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(INSTALL_DISMISSED_KEY);
    } catch {
      stored = null;
    }
    if (isDismissalActive(stored, Date.now())) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      remember(INSTALL_DISMISSED_FOREVER);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIosInstallCapable(navigator.userAgent, navigator.maxTouchPoints)) {
      setShowIosHint(true);
    }

    // Engagement, then patience. `armed` opens the door after the minimum
    // dwell; a scroll past the fold walks through it, and the long timer is
    // there for the reader who never scrolls at all.
    let armed = false;
    let done = false;

    const reveal = () => {
      if (done) return;
      done = true;
      setVisible(true);
      window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => {
      if (armed && window.scrollY > window.innerHeight * SCROLL_TRIGGER_VH) reveal();
    };

    const armTimer = window.setTimeout(() => {
      armed = true;
      onScroll();
    }, MIN_DWELL_MS);
    const fallbackTimer = window.setTimeout(reveal, MAX_WAIT_MS);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(armTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [remember]);

  const dismiss = useCallback(() => {
    setLeaving(true);
    remember(String(Date.now()));
    window.setTimeout(() => setVisible(false), 220);
  }, [remember]);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // Either way the event is spent — Chromium will not let it be reused.
    setDeferred(null);
    remember(outcome === "accepted" ? INSTALL_DISMISSED_FOREVER : String(Date.now()));
    setVisible(false);
  }, [deferred, remember]);

  // Nothing to offer: no Chromium event, and not a platform where the manual
  // instructions would work.
  if (!visible || (!deferred && !showIosHint)) return null;
  // Checked at render, not once on mount, so walking into checkout takes the
  // card away with it.
  if (!isPromptableRoute(pathname)) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="tm-install-title"
      className={cn(
        // Phones and tablets only (see `isMobileInstallContext`), so there is
        // no desktop placement to write. Sits above the fixed bottom tab bar
        // rather than over it: the tabs stay usable, which makes this an offer
        // and not a blockade.
        "fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md",
        "rounded-2xl border border-tm-border bg-card p-4 shadow-[0_18px_44px_-12px_rgba(43,36,34,0.28)]",
        leaving ? "tm-install-leave" : "tm-install-enter",
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-tm-tint hover:text-tm-ink"
      >
        <X size={15} weight="bold" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-tm-tint">
          <Image
            src="/images/brand/logo-mark.webp"
            alt=""
            width={560}
            height={259}
            sizes="40px"
            className="w-9"
          />
        </span>
        <div className="min-w-0">
          <p id="tm-install-title" className="font-display text-[15px] font-bold text-tm-ink">
            Install Tomame
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-tm-text-2">
            {deferred
              ? "Add it to your home screen — opens like an app, tracks your orders, no browser in the way."
              : "Add it to your home screen and it opens like an app, straight to your orders."}
          </p>
        </div>
      </div>

      {deferred ? (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm" className="flex-1" onClick={() => void install()}>
            Install
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Not now
          </Button>
        </div>
      ) : (
        // iOS: there is no button that can do this. Name the gesture instead.
        <ol className="mt-3 space-y-1.5 rounded-xl bg-tm-pill-bg px-3 py-2.5 text-[13px] text-tm-text-2">
          <li className="flex items-center gap-2">
            <span className="font-semibold text-tm-ink">1.</span>
            Tap
            <Export size={16} weight="bold" className="text-tm-coral" aria-label="the Share button" />
            in the toolbar
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-tm-ink">2.</span>
            Choose <span className="font-semibold text-tm-ink">Add to Home Screen</span>
          </li>
        </ol>
      )}
    </div>
  );
}
