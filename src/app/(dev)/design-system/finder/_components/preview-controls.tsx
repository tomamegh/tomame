"use client";

import { ArrowCounterClockwise, CaretDown, Pause, Play } from "@phosphor-icons/react";
import { useState } from "react";

import { FINDER_SCENARIOS, type FinderScenarioKey } from "@/features/finder/fixtures";
import { formatClock } from "@/features/finder/format";
import { cn } from "@/lib/utils";

import type { ScriptedRun } from "../_lib/use-scripted-run";

export type PreviewFrame = "mobile" | "desktop";
export type PreviewTheme = "light" | "dark";

interface PreviewControlsProps {
  player: ScriptedRun;
  current: FinderScenarioKey | null;
  frame: PreviewFrame;
  onFrameChange: (frame: PreviewFrame) => void;
  theme: PreviewTheme;
  onThemeChange: (theme: PreviewTheme) => void;
}

/** The dev-only floating panel. Not part of the product. */
export function PreviewControls({ player, current, frame, onFrameChange, theme, onThemeChange }: PreviewControlsProps) {
  const [open, setOpen] = useState(true);
  const atEnd = player.clock != null && player.clock >= player.duration;

  return (
    <aside
      aria-label="Preview controls"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-border bg-card/95 text-foreground shadow-[0_18px_40px_-16px_rgba(43,36,34,0.35)] backdrop-blur"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 text-left text-[13px] font-semibold outline-none focus-visible:ring-4 focus-visible:ring-tm-coral/20"
      >
        <span>
          Preview controls
          <span className="tm-nums ml-2 font-medium text-muted-foreground">
            {formatClock(player.clock ?? 0)} / {formatClock(player.duration)}
          </span>
        </span>
        <CaretDown size={14} weight="bold" className={cn("transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 pb-4 pt-3">
          <div className="flex items-center gap-2">
            <IconButton
              label={player.playing ? "Pause" : atEnd ? "Replay" : "Play"}
              onClick={player.togglePlay}
              disabled={player.view === "email"}
            >
              {player.playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
            </IconButton>
            <IconButton label="Back to the ask screen" onClick={player.reset}>
              <ArrowCounterClockwise size={16} weight="bold" />
            </IconButton>
            <Segmented
              label="Speed"
              value={player.speed}
              options={[
                { value: 1, label: "1×" },
                { value: 4, label: "4×" },
              ]}
              onChange={player.setSpeed}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Jump to</span>
            <div className="flex flex-wrap gap-1.5">
              {FINDER_SCENARIOS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={current === s.key}
                  onClick={() => player.jump(s.key)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-tm-coral/20",
                    current === s.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Segmented
              label="Frame"
              value={frame}
              options={[
                { value: "mobile", label: "Mobile" },
                { value: "desktop", label: "Desktop" },
              ]}
              onChange={onFrameChange}
            />
            <Segmented
              label="Theme"
              value={theme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={onThemeChange}
            />
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Plays a recorded run whatever you type; a request with &ldquo;PS5&rdquo; plays the nothing-found run.
          </p>
        </div>
      )}
    </aside>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 items-center justify-center rounded-full border border-border bg-background outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-4 focus-visible:ring-tm-coral/20 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex h-9 items-center rounded-full border border-border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-full px-3 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-tm-coral/20",
            value === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
