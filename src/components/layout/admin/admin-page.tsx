import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The admin design kit — the handful of shapes every admin screen is built from.
 *
 * WHY IT EXISTS. Before the v2 pass each admin page invented its own heading
 * (`text-xl font-bold text-stone-800` here, `text-2xl` and a different grey
 * there), its own card, and its own empty state, against the *pre-redesign*
 * stone/slate palette — so the admin looked like a different product from the
 * storefront it administers. These components are the single spelling of those
 * shapes, on the v2 tokens (`--tm-*`), and an admin screen should reach for one
 * of them before writing a class list of its own.
 *
 * The tone vocabulary is the storefront's, deliberately: green means settled,
 * amber means "a person still has to do something", coral is the brand action.
 * An admin reading both surfaces should not have to learn two colour languages.
 */

// ── Page ─────────────────────────────────────────────────────────────────────

export interface AdminPageProps {
  title: string;
  /** One line under the title: what this screen is FOR, not what is on it. */
  blurb?: string;
  /** Controls on the header's right — a filter, a "New…" button, a count. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The frame every `/admin/*` route renders into: a title block, then content at
 * a consistent rhythm. Entrance animation matches the storefront's `tm-up`.
 */
export function AdminPage({ title, blurb, action, children, className }: AdminPageProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <header className="tm-up flex flex-wrap items-start justify-between gap-4 [animation-duration:0.5s]">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.02em] text-tm-ink sm:text-[30px]">
            {title}
          </h1>
          {blurb ? (
            <p className="max-w-[64ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
              {blurb}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export interface AdminCardProps {
  title?: string;
  blurb?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Drop the body padding — for a card whose child is a full-bleed table. */
  flush?: boolean;
  /** Stagger index: cards enter in reading order rather than all at once. */
  index?: number;
  className?: string;
}

export function AdminCard({
  title,
  blurb,
  action,
  children,
  flush = false,
  index = 0,
  className,
}: AdminCardProps) {
  return (
    <section
      className={cn(
        "tm-up overflow-hidden rounded-[20px] border border-tm-border bg-card [animation-duration:0.5s]",
        className,
      )}
      style={{ animationDelay: `${0.06 + index * 0.06}s` }}
    >
      {(title || action) && (
        <header
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 px-5 py-4",
            // Only when something follows it — a header on an empty card should
            // not draw a rule under itself.
            "border-b border-tm-hairline",
          )}
        >
          <div className="flex flex-col gap-1">
            {title ? (
              <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">
                {title}
              </h2>
            ) : null}
            {blurb ? (
              <p className="max-w-[60ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
                {blurb}
              </p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      )}
      <div className={flush ? undefined : "p-5"}>{children}</div>
    </section>
  );
}

// ── Empty ────────────────────────────────────────────────────────────────────

/**
 * The honest empty state. An admin queue that is genuinely empty is good news
 * and must say so — it may never show a sample row to fill the space, for the
 * same reason the storefront may not (CLAUDE.md: nothing static).
 */
export function AdminEmpty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-[16px] bg-tm-paper px-6 py-10">
      <p className="font-display text-[16px] leading-[1.25] font-bold text-tm-ink">{title}</p>
      <p className="max-w-[54ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">{body}</p>
      {children}
    </div>
  );
}

// ── Stat ─────────────────────────────────────────────────────────────────────

export interface AdminStatProps {
  label: string;
  /** Already formatted. This component never computes or rounds a figure. */
  value: string;
  /** A second line — "3 waiting on a buyer", "since Monday". */
  detail?: string | null;
  tone?: AdminTone;
  /** Makes the whole tile a link to the screen that explains it. */
  href?: string;
  icon?: React.ReactNode;
  index?: number;
}

export function AdminStat({
  label,
  value,
  detail,
  tone = "neutral",
  href,
  icon,
  index = 0,
}: AdminStatProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-none font-semibold text-tm-text-2">{label}</span>
        {icon ? <span className="shrink-0 text-tm-text-3">{icon}</span> : null}
      </div>
      <span
        className={cn(
          "tm-nums font-display text-[28px] leading-none font-bold tracking-[-0.02em]",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      {detail ? (
        <span className="text-xs leading-[1.4] font-medium text-tm-text-3">{detail}</span>
      ) : null}
    </>
  );

  const className = cn(
    "tm-up flex flex-col gap-2.5 rounded-[20px] border border-tm-border bg-card p-5 [animation-duration:0.5s]",
    href && "transition-colors hover:border-tm-coral/40 hover:bg-tm-pill-bg",
  );
  const style = { animationDelay: `${0.06 + index * 0.05}s` };

  return href ? (
    <Link href={href} className={className} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

// ── Tone ─────────────────────────────────────────────────────────────────────

/**
 * One tone vocabulary for the whole admin.
 *
 * `amber` is the load-bearing one: it means a HUMAN still owes someone an
 * action — an open assisted request, a stuck paste, an order awaiting review.
 * It is not "error". `coral` is reserved for the brand's own accent so it does
 * not get spent on ordinary states.
 */
export type AdminTone = "neutral" | "green" | "amber" | "coral" | "muted";

const TONE_TEXT: Record<AdminTone, string> = {
  neutral: "text-tm-ink",
  green: "text-tm-green",
  amber: "text-tm-amber",
  coral: "text-tm-coral",
  muted: "text-tm-text-3",
};

const TONE_PILL: Record<AdminTone, string> = {
  neutral: "bg-tm-tint text-tm-ink",
  green: "bg-tm-green-bg text-tm-green-ink",
  amber: "bg-tm-amber-bg text-[#7a4a06]",
  coral: "bg-tm-pill-bg text-tm-coral-strong",
  muted: "bg-tm-paper text-tm-text-3",
};

/** A status chip. The label is passed in already humanised — this never maps slugs. */
export function AdminBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold whitespace-nowrap",
        TONE_PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

/**
 * Admin tables are wide and admins work on laptops, so the table scrolls inside
 * its own card rather than widening the page — the shell has a fixed sidebar and
 * a body that must never scroll horizontally.
 */
export function AdminTableScroller({ children }: { children: React.ReactNode }) {
  return <div className="w-full overflow-x-auto">{children}</div>;
}

/** Shared cell rhythm, so two tables in the admin cannot disagree about padding. */
export const ADMIN_TH =
  "px-4 py-3 text-left text-[12px] leading-none font-bold tracking-normal text-tm-text-2 whitespace-nowrap";
export const ADMIN_TD =
  "px-4 py-3.5 text-[13px] leading-[1.4] text-tm-ink align-middle";
export const ADMIN_TR = "border-t border-tm-hairline transition-colors hover:bg-tm-paper/60";
