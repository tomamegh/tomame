import { Check, CircleNotch } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

export interface ReadingIndicatorProps {
  /** "amazon.com" — the one thing the customer recognises before a title exists. */
  host: string;
  /** The phase's headline — "Reading this page…", "Taking longer than usual". */
  title: string;
  /** The phase's second line, or null. */
  detail: string | null;
  /** Seconds since the paste was queued, or null when the clock is not yet running. */
  elapsedSeconds: number | null;
  /** Amber once the wait has become a problem; the bar keeps moving either way. */
  tone?: "neutral" | "amber";
  /**
   * Where the job really is, from its status: `queued` (waiting for a reader)
   * or `reading` (a reader has the page). Shown as steps; omitted, no steps.
   */
  stage?: ReadingStage;
  className?: string;
}

/**
 * The visible fact that a link is being read.
 *
 * A single spinning glyph beside a line of 13px text was the whole animation
 * before, and on a busy list it read as static. This is three things that
 * move or change: the spinner, a sweeping bar, and the elapsed count — none of
 * them a percentage, because a race across vendors has no known length and a
 * bar that fills would be a promise about timing nothing here can keep.
 *
 * `aria-live="polite"` on the copy, so a screen reader hears the phase change
 * at 5 s and 20 s without being told about every tick of the counter, which is
 * `aria-hidden`.
 */
export function ReadingIndicator({ host, title, detail, elapsedSeconds, tone = "neutral", stage, className }: ReadingIndicatorProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <CircleNotch className="size-4 shrink-0 animate-spin text-tm-coral" aria-hidden />
          <span className="truncate text-[15px] leading-[1.3] font-semibold text-tm-ink">{host}</span>
        </span>
        {elapsedSeconds != null && (
          <span aria-hidden className="tm-nums shrink-0 text-xs leading-none font-medium text-tm-text-3">
            {elapsedSeconds}s
          </span>
        )}
      </div>

      <span
        role="progressbar"
        aria-label={`Reading ${host}`}
        className="relative block h-1 w-full overflow-hidden rounded-full bg-tm-tint"
      >
        <span
          aria-hidden
          className={cn(
            "tm-sweep absolute inset-y-0 left-0 w-1/4 rounded-full",
            tone === "amber" ? "bg-tm-amber" : "bg-[image:var(--tm-gradient)]",
          )}
        />
      </span>

      <div aria-live="polite" className="flex flex-col gap-1">
        <span
          className={cn(
            "text-[13px] leading-none font-medium",
            tone === "amber" ? "text-tm-amber" : "text-tm-text-2",
          )}
        >
          {title}
        </span>
        {detail && <span className="text-xs leading-[1.45] text-tm-text-3">{detail}</span>}
      </div>

      {stage && <ReadingSteps host={host} stage={stage} />}
    </div>
  );
}

type StepState = "done" | "active" | "next";

/** queued: waiting for a reader · reading: a reader has the page · pricing: read, the landed total is settling. */
export type ReadingStage = "queued" | "reading" | "pricing";

/** The stage a paste is at, from its job status and whether its quote line is still settling. */
export function readingStageOf(jobStatus: string, pricing: boolean): ReadingStage {
  if (pricing) return "pricing";
  return jobStatus === "running" ? "reading" : "queued";
}

/**
 * The read as steps, like the price finder's. Only the job's status moves
 * them: a step is ticked when the job has passed it, never on a timer. The
 * last step ticks off when the price lands and the row becomes the quote.
 */
export function readingSteps(host: string, stage: ReadingStage): Array<{ label: string; state: StepState }> {
  const at = { queued: 1, reading: 2, pricing: 3 }[stage];
  const state = (i: number): StepState => (i < at ? "done" : i === at ? "active" : "next");
  return [
    { label: "Link received", state: "done" },
    { label: `Opening ${host}`, state: state(1) },
    { label: "Reading the price, stock and weight", state: state(2) },
    { label: "Adding tax, freight and customs to Accra", state: state(3) },
  ];
}

/** One line for a busy list: four segments and the step under way. */
export function ReadingStepsCompact({ host, stage, className }: { host: string; stage: ReadingStage; className?: string }) {
  const steps = readingSteps(host, stage);
  const active = steps.findIndex((s) => s.state === "active");
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span aria-hidden className="flex shrink-0 gap-1">
        {steps.map((s, i) => (
          <span
            key={i}
            className={cn(
              "h-1 w-4 rounded-full transition-colors duration-500",
              s.state === "done" ? "bg-tm-green" : s.state === "active" ? "tm-pulse-dot bg-tm-coral" : "bg-tm-border",
            )}
          />
        ))}
      </span>
      <span aria-live="polite" className="truncate text-[12px] leading-none font-medium text-tm-text-2">
        {steps[active]?.label}
      </span>
    </div>
  );
}

export function ReadingSteps({ host, stage }: { host: string; stage: ReadingStage }) {
  return (
    <ol aria-label="Progress" className="flex flex-col gap-2 pt-0.5">
      {readingSteps(host, stage).map((step, i) => (
        <li
          key={step.label}
          className="tm-up flex items-center gap-2.5 text-[13px] leading-none"
          style={{ animationDelay: `${i * 70}ms` }}
          aria-current={step.state === "active" ? "step" : undefined}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-500",
              step.state === "done" && "bg-tm-green text-white",
              step.state === "active" && "bg-tm-tint text-tm-coral",
              step.state === "next" && "border border-tm-border bg-card",
            )}
          >
            {step.state === "done" ? (
              <Check weight="bold" className="size-3" />
            ) : step.state === "active" ? (
              <CircleNotch weight="bold" className="size-3 animate-spin" />
            ) : null}
          </span>
          <span
            className={cn(
              "truncate",
              step.state === "done" && "font-medium text-tm-text-2",
              step.state === "active" && "font-semibold text-tm-ink",
              step.state === "next" && "font-medium text-tm-text-3",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
