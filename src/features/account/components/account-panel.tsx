import { cn } from "@/lib/utils";

/**
 * The white card every account panel sits in.
 *
 * One component rather than six copies of the same class list, so radius, type
 * scale and the entrance animation cannot drift between tabs. The 24px radius,
 * `tm-up` and the 0.5s duration are the established v2 card, matching
 * `bag-deliver-to-card.tsx`; the rail leads at 0.06s and the panel follows at
 * 0.12s, so the two arrive in reading order rather than together.
 *
 * `leading-*` is kept in the same string as its font size throughout — phase-2
 * §5.11: `cn()` drops the line-height when a size class arrives from the other
 * argument.
 */
export function AccountPanel({
  title,
  blurb,
  action,
  children,
  className,
}: {
  title: string;
  blurb?: string;
  /** Optional control on the header's right — "Add an address", a count, a link. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "tm-up flex flex-col gap-5 rounded-[24px] border border-tm-border bg-card p-[22px] sm:p-6",
        "[animation-delay:0.12s] [animation-duration:0.5s]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-[22px] leading-none font-bold">
            {title}
          </h2>
          {blurb ? (
            <p className="max-w-[54ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
              {blurb}
            </p>
          ) : null}
        </div>
        {action}
      </header>

      {children}
    </section>
  );
}

/**
 * The honest empty state. Every tab can legitimately have nothing in it — a new
 * account has no addresses, no payments, no watches and no notifications — and
 * none of them may show a sample row to fill the space.
 */
export function AccountEmpty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[16px] bg-tm-paper p-6">
      <p className="font-display text-[17px] leading-[1.25] font-bold">{title}</p>
      <p className="max-w-[52ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
        {body}
      </p>
      {children}
    </div>
  );
}
