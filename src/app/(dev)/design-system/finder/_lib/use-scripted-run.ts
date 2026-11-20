"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FINDER_SCENARIOS, FOUND_RUN, NOT_FOUND_RUN, type FinderScenarioKey } from "@/features/finder/fixtures";
import { createInitialFinderState, reduceFinderEvents } from "@/features/finder/state/reducer";
import type { FinderEvent, FinderState } from "@/features/finder/types";

/** How often the scripted clock advances. Events land within this of their time. */
const TICK_MS = 100;

export type PlaybackSpeed = 1 | 4;

export interface ScriptedRun {
  state: FinderState;
  elapsedMs: number;
  /** Scripted time; null before a run starts (the ask screen). */
  clock: number | null;
  duration: number;
  playing: boolean;
  speed: PlaybackSpeed;
  view: "experience" | "email";
  togglePlay: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  jump: (scenario: FinderScenarioKey) => void;
  start: (query: string) => void;
  reset: () => void;
}

function runEnd(run: readonly FinderEvent[]): number {
  return run.reduce((max, e) => Math.max(max, e.at), 0);
}

/**
 * Plays a recorded event stream against a clock the preview controls, so the
 * screen sees events arrive exactly as it would from the live job.
 */
export function useScriptedRun(): ScriptedRun {
  const [run, setRun] = useState<readonly FinderEvent[]>(FOUND_RUN);
  const [clock, setClock] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [view, setView] = useState<"experience" | "email">("experience");
  const duration = useMemo(() => runEnd(run), [run]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setClock((c) => (c == null ? c : Math.min(duration, c + TICK_MS * speed)));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, duration]);

  useEffect(() => {
    if (playing && clock != null && clock >= duration) setPlaying(false);
  }, [playing, clock, duration]);

  // Re-reduce only when another event has landed, not on every tick: `started`
  // and `applied` carry everything about the clock the state depends on.
  const started = clock != null;
  const applied = clock == null ? 0 : run.filter((e) => e.at <= clock).length;
  const state = useMemo(
    () => (started ? reduceFinderEvents(run.slice(0, applied)) : createInitialFinderState()),
    [run, applied, started],
  );

  const elapsedMs =
    state.startedAt == null ? 0 : (state.finishedAt ?? clock ?? state.startedAt) - state.startedAt;

  const togglePlay = useCallback(() => {
    if (clock == null) {
      setClock(0);
      setPlaying(true);
      return;
    }
    if (!playing && clock >= duration) setClock(0);
    setPlaying((p) => !p);
  }, [clock, duration, playing]);

  const jump = useCallback((key: FinderScenarioKey) => {
    const scenario = FINDER_SCENARIOS.find((s) => s.key === key);
    if (!scenario) return;
    setRun(scenario.run);
    setClock(scenario.jumpTo);
    setView(key === "email" ? "email" : "experience");
    // A still-confirming result keeps playing so the held price confirms on screen.
    setPlaying(key === "confirming" || key === "working");
  }, []);

  const start = useCallback((query: string) => {
    setRun(/\b(ps5|playstation)/i.test(query) ? NOT_FOUND_RUN : FOUND_RUN);
    setView("experience");
    setClock(0);
    setPlaying(true);
  }, []);

  const reset = useCallback(() => {
    setRun(FOUND_RUN);
    setView("experience");
    setClock(null);
    setPlaying(false);
  }, []);

  return { state, elapsedMs, clock, duration, playing, speed, view, togglePlay, setSpeed, jump, start, reset };
}
