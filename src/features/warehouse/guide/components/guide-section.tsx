import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One chapter of the guide (081). Server-safe: no hooks. The `id` is the
 * anchor the contents list scrolls to and the scroll-spy watches, and the
 * `scroll-mt` keeps the heading clear of the sticky header when it lands.
 */
export function GuideSection({
  id,
  index,
  icon: Icon,
  kicker,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  index: number;
  icon: LucideIcon;
  kicker?: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-guide-section={id}
      aria-labelledby={`${id}-title`}
      className={cn("flex min-w-0 scroll-mt-28 flex-col gap-6 border-t border-tm-hairline pt-12 first:border-t-0 first:pt-0", className)}
    >
      <header className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-tm-tint text-tm-coral-strong">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <span className="text-[11px] font-bold tracking-[0.16em] text-tm-coral-strong uppercase">
            {String(index).padStart(2, "0")} · {kicker ?? "Guide"}
          </span>
        </div>
        <h2 id={`${id}-title`} className="font-display text-[26px] leading-[1.05] font-bold tracking-[-0.02em] text-tm-ink sm:text-[30px]">
          {title}
        </h2>
        {lead ? <p className="max-w-[68ch] text-[15px] leading-[1.6] font-medium text-tm-text-2">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}
