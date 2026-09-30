import { CheckIcon, EyeIcon, MinusIcon, ShieldAlertIcon, WrenchIcon, HandIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { GOLDEN_RULES, MISTAKES, ROLES, YOU_SEE, type Reversibility } from "../content";

/**
 * The guide's two read-only chapters (081): who you are here, and how to undo
 * things. Server components — nothing on them moves.
 */

export function FirstDay() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {ROLES.map((role) => (
          <article
            key={role.id}
            className={cn(
              "flex min-w-0 flex-col gap-4 rounded-[24px] border p-5 sm:p-6",
              role.id === "operator" ? "border-tm-coral/35 bg-card shadow-[0_22px_48px_-36px_rgba(242,91,61,0.7)]" : "border-tm-border bg-card",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[19px] font-bold text-tm-ink">{role.name}</h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold",
                  role.id === "operator" ? "bg-tm-amber-bg text-[#7a4a06]" : "bg-tm-paper text-tm-text-2",
                )}
              >
                {role.badge}
              </span>
            </div>
            <p className="text-[13.5px] leading-[1.55] font-medium text-tm-text-2">{role.summary}</p>
            <ul className="flex flex-col gap-2">
              {role.can.map((c) => (
                <li key={c} className="flex gap-2.5 text-[13.5px] leading-[1.5] font-medium text-tm-ink">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-tm-green" aria-hidden />
                  <span className="min-w-0">{c}</span>
                </li>
              ))}
              {role.cannot.map((c) => (
                <li key={c} className="flex gap-2.5 text-[13.5px] leading-[1.5] font-medium text-tm-text-3">
                  <MinusIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="sr-only">Cannot: </span>
                    {c}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-3 rounded-[24px] border border-tm-border bg-card p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-display text-[17px] font-bold text-tm-ink">
          <EyeIcon className="size-[18px] text-tm-text-3" aria-hidden />
          What you see about each parcel
        </h3>
        <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {YOU_SEE.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-1 rounded-[16px] bg-tm-paper p-3.5">
              <dt className="text-[13px] font-bold text-tm-ink">{item.label}</dt>
              <dd className="text-[12.5px] leading-[1.5] font-medium text-tm-text-2">{item.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
          Addresses and phone numbers are there to get a box to the right door. Use them for that and nothing else.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="font-display text-[17px] font-bold text-tm-ink">Four rules that cover almost everything</h3>
        <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {GOLDEN_RULES.map((rule, i) => (
            <li key={rule.title} className="flex min-w-0 gap-3.5 rounded-[20px] border border-tm-border bg-card p-4">
              <span className="tm-nums flex size-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--tm-gradient-cta)] font-display text-[14px] font-bold text-white">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14.5px] font-bold text-tm-ink">{rule.title}</span>
                <span className="text-[13px] leading-[1.5] font-medium text-tm-text-2">{rule.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const LEVELS: Array<{ id: Reversibility; title: string; body: string; icon: typeof WrenchIcon; tone: string }> = [
  { id: "easy", title: "Fix it yourself", body: "One click, no harm done.", icon: WrenchIcon, tone: "bg-tm-green-bg text-tm-green-ink" },
  { id: "careful", title: "Fix it, then check", body: "Easy to undo, but something else needs redoing.", icon: HandIcon, tone: "bg-tm-amber-bg text-[#7a4a06]" },
  { id: "admin", title: "Tell an admin", body: "The customer has already been told and statuses only move forward. There is no undo; an admin handles it with the customer.", icon: ShieldAlertIcon, tone: "bg-tm-pill-bg text-tm-coral-strong" },
];

export function Mistakes() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {LEVELS.map((level) => {
        const rows = MISTAKES.filter((m) => m.level === level.id);
        return (
          <div key={level.id} className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-8 items-center justify-center rounded-[10px]", level.tone)}>
                <level.icon className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col">
                <h3 className="font-display text-[16px] leading-tight font-bold text-tm-ink">{level.title}</h3>
                <p className="text-[12.5px] font-medium text-tm-text-3">{level.body}</p>
              </div>
            </div>
            <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
              {rows.map((m) => (
                <li key={m.id} className="flex min-w-0 flex-col gap-2 rounded-[20px] border border-tm-border bg-card p-4">
                  <span className="text-[14px] font-semibold text-tm-ink">{m.problem}</span>
                  <span className="text-[13px] leading-[1.55] font-medium text-tm-text-2">{m.fix}</span>
                  <span className="mt-auto w-fit rounded-full bg-tm-paper px-2.5 py-1 text-[11.5px] font-semibold text-tm-text-3">{m.where}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
