"use client";

import { useCallback, useSyncExternalStore } from "react";

import { EMPTY_PROGRESS, GUIDE_STORAGE_KEY, parseProgress, type GuideProgress } from "./progress";

/**
 * The guide's progress as a tiny external store over localStorage (081).
 * Every component that reads it re-renders together, other tabs included, and
 * the server snapshot is the empty state, so nothing mismatches on hydration.
 */

const EVENT = "tm:guide-progress";

let cachedRaw: string | null | undefined;
let cachedValue: GuideProgress = EMPTY_PROGRESS;
/** In-memory fallback so a blocked store still behaves for this page view. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
  try {
    const stored = window.localStorage.getItem(GUIDE_STORAGE_KEY);
    return memoryRaw ?? stored;
  } catch {
    return memoryRaw;
  }
}

function snapshot(): GuideProgress {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parseProgress(raw);
  }
  return cachedValue;
}

function serverSnapshot(): GuideProgress {
  return EMPTY_PROGRESS;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === GUIDE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

export function writeGuideProgress(update: (current: GuideProgress) => GuideProgress): void {
  const current = snapshot();
  const next = update(current);
  if (next === current) return;
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, raw);
  } catch {
    memoryRaw = raw;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useGuideProgress(): [GuideProgress, (update: (current: GuideProgress) => GuideProgress) => void] {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const update = useCallback((fn: (current: GuideProgress) => GuideProgress) => writeGuideProgress(fn), []);
  return [progress, update];
}

/** False on the server and during hydration; true once the browser's copy has been read. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}
