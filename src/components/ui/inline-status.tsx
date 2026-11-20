import type { Icon } from "@phosphor-icons/react";
import {
  CheckCircle,
  CircleNotch,
  Info,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "progress" | "success" | "warning" | "danger";

/** Surface + icon colour per tone. Tinted surfaces carry a dark pair: tm-* never flip under `.dark`. */
const TONE: Record<StatusTone, { surface: string; icon: string; Icon: Icon }> = {
  neutral: { surface: "bg-muted", icon: "text-muted-foreground", Icon: Info },
  progress: { surface: "bg-tm-tint dark:bg-tm-coral/15", icon: "text-tm-coral", Icon: CircleNotch },
  success: { surface: "bg-tm-green-bg dark:bg-tm-green/15", icon: "text-tm-green", Icon: CheckCircle },
  warning: { surface: "bg-tm-amber-bg dark:bg-tm-amber/15", icon: "text-tm-amber", Icon: WarningCircle },
  danger: { surface: "bg-destructive/10", icon: "text-destructive", Icon: XCircle },
};

export interface InlineStatusProps {
  tone?: StatusTone;
  /** One short line: what is true now. */
  title: React.ReactNode;
  /** What happens next, or what the customer can do. Optional. */
  children?: React.ReactNode;
  /** Overrides the tone's icon. `progress` spins its default icon. */
  icon?: Icon;
  /** A link or button that acts on this status. */
  action?: React.ReactNode;
  /** Announce changes to screen readers (default true). */
  live?: boolean;
  className?: string;
}

/**
 * A status line inside a card: what is happening, what happens next, and at
 * most one action. Used for holds, checks, reading states and soft errors, so
 * every "please wait" on the site has the same shape and tone of voice.
 */
export function InlineStatus({
  tone = "neutral",
  title,
  children,
  icon,
  action,
  live = true,
  className,
}: InlineStatusProps) {
  const style = TONE[tone];
  const StatusIcon = icon ?? style.Icon;
  const spins = tone === "progress" && !icon;

  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={cn("flex items-start gap-2.5 rounded-[14px] px-3.5 py-3", style.surface, className)}
    >
      <StatusIcon
        weight={spins ? "bold" : "fill"}
        className={cn("mt-px size-[18px] shrink-0", style.icon, spins && "animate-spin motion-reduce:animate-none")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13.5px] leading-[1.35] font-semibold text-foreground">{title}</p>
        {children && <div className="tm-caption text-muted-foreground">{children}</div>}
        {action && <div className="mt-1.5 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
