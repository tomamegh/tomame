import type { Icon } from "@phosphor-icons/react";
import { WarningCircle, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: Icon;
  title: string;
  /** One sentence. */
  description?: React.ReactNode;
  /** The one next step. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Nothing here yet, and the one thing to do about it. Centred, calm, inside a
 * card — never a paragraph of instructions.
 */
export function EmptyState({ icon: StateIcon, title, description, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-3 rounded-[24px] border border-border bg-card px-6 py-10 text-center",
        className,
      )}
    >
      {StateIcon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <StateIcon weight="duotone" className="size-6 text-tm-coral" aria-hidden />
        </span>
      )}
      <h2 className="tm-title-3 text-foreground">{title}</h2>
      {description && <p className="tm-body max-w-[340px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </section>
  );
}

export interface ErrorStateProps {
  title: string;
  /** Plain language: what went wrong, without codes. */
  description?: React.ReactNode;
  /** Try again, or go somewhere that works. */
  action?: React.ReactNode;
  /** `wa.me` link to a person, when one is configured. */
  whatsappHref?: string | null;
  className?: string;
}

/** An error in plain words, one way forward, and a person on WhatsApp when we have a number. */
export function ErrorState({ title, description, action, whatsappHref, className }: ErrorStateProps) {
  return (
    <EmptyState
      icon={WarningCircle}
      title={title}
      description={description}
      className={className}
      action={
        action || whatsappHref ? (
          <>
            {action}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-[14px] px-3 text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
              >
                <WhatsappLogo weight="fill" className="size-[18px] text-[#25D366]" aria-hidden />
                Message us on WhatsApp
              </a>
            )}
          </>
        ) : undefined
      }
    />
  );
}
