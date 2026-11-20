import { cn } from "@/lib/utils";
import type { StatusTone } from "./inline-status";

const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  progress: { pill: "bg-tm-tint text-tm-coral-strong dark:bg-tm-coral/15 dark:text-tm-coral", dot: "bg-tm-coral" },
  success: { pill: "bg-tm-green-bg text-tm-green-ink dark:bg-tm-green/15 dark:text-tm-green", dot: "bg-tm-green" },
  warning: { pill: "bg-tm-amber-bg text-[#7a4a06] dark:bg-tm-amber/15 dark:text-tm-amber", dot: "bg-tm-amber" },
  danger: { pill: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

export interface StatusPillProps {
  tone?: StatusTone;
  children: React.ReactNode;
  /** Pulses the dot, for a state that is still moving (reading, checking). */
  pulse?: boolean;
  className?: string;
}

/** A one- or two-word status with a coloured dot: "Reading", "Ready", "Confirming price". */
export function StatusPill({ tone = "neutral", children, pulse = false, className }: StatusPillProps) {
  const style = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-none font-semibold whitespace-nowrap",
        style.pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot, pulse && "tm-pulse-dot")} />
      {children}
    </span>
  );
}
