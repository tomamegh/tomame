import Link from "next/link";

import { AdminBadge, AdminCard } from "@/components/layout/admin/admin-page";
import { cn } from "@/lib/utils";
import type { AiUsageDayView } from "../ai-usage.service";
import { AI_USAGE_FLAG } from "../summary";

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" }).format(new Date(iso));
const n = (v: number) => v.toLocaleString("en-US");
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** The AI use screen: one day's totals, the 14 days before it, and every person who used the assistant that day. */
export function AiUsageBoard({ view, today }: { view: AiUsageDayView; today: string }) {
  const { totals, people, trend, day } = view;
  const peak = Math.max(1, ...trend.map((d) => d.chats + d.searches + d.refused));
  const flagged = people.filter((p) => p.flagged).length;
  const shift = (d: number) => new Date(Date.parse(`${day}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/ai-usage?day=${shift(-1)}`} className="rounded-full border border-tm-border bg-card px-3 py-1.5 text-[13px] font-semibold text-tm-ink hover:border-tm-coral/50">
          ← Previous day
        </Link>
        <span className="px-2 font-display text-[15px] font-bold text-tm-ink">{day === today ? `Today, ${dayLabel(day)}` : dayLabel(day)}</span>
        {day < today ? (
          <Link href={`/admin/ai-usage?day=${shift(1)}`} className="rounded-full border border-tm-border bg-card px-3 py-1.5 text-[13px] font-semibold text-tm-ink hover:border-tm-coral/50">
            Next day →
          </Link>
        ) : null}
        {flagged > 0 ? <AdminBadge tone="coral">{flagged} to look at</AdminBadge> : <AdminBadge tone="green">Nothing unusual</AdminBadge>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Messages", totals.chats, "answered by the assistant"],
          ["Searches", totals.searches, "store searches run"],
          ["Turned away", totals.refused, "rate limit or sign-in wall"],
          ["Customers", totals.customers, "signed in"],
          ["Visitors", totals.visitors, "not signed in, by IP"],
          ["Tokens", totals.inputTokens + totals.outputTokens, `${n(totals.inputTokens)} in · ${n(totals.outputTokens)} out`],
        ].map(([label, value, note]) => (
          <div key={label as string} className="flex flex-col gap-1 rounded-[16px] border border-tm-border bg-card p-4">
            <span className="text-[12px] font-semibold text-tm-text-2">{label}</span>
            <span className="tm-nums font-display text-[24px] leading-none font-bold text-tm-ink">{n(value as number)}</span>
            <span className="text-[11.5px] leading-snug text-tm-text-3">{note}</span>
          </div>
        ))}
      </div>

      <AdminCard title="Last 14 days" blurb="Messages and searches per day. Coral is people turned away.">
        <div className="flex h-36 items-end gap-1.5">
          {trend.map((d) => {
            const total = d.chats + d.searches + d.refused;
            return (
              <Link key={d.day} href={`/admin/ai-usage?day=${d.day}`} title={`${dayLabel(d.day)}: ${d.chats} messages, ${d.searches} searches, ${d.refused} turned away`} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="tm-nums text-[10.5px] font-semibold text-tm-text-3">{total || ""}</span>
                <span className={cn("flex w-full flex-col justify-end overflow-hidden rounded-t-[6px]", d.day === day && "ring-2 ring-tm-coral/50")} style={{ height: `${Math.max(2, (total / peak) * 100)}%` }}>
                  <span className="bg-tm-coral" style={{ flexGrow: d.refused }} />
                  <span className="bg-tm-ink/70" style={{ flexGrow: d.searches }} />
                  <span className="bg-tm-ink/25 group-hover:bg-tm-ink/35" style={{ flexGrow: d.chats || (total ? 0 : 1) }} />
                </span>
                <span className="text-[10px] text-tm-text-3">{d.day.slice(8)}</span>
              </Link>
            );
          })}
        </div>
      </AdminCard>

      <AdminCard
        title="Who used it"
        blurb={`Flagged: a customer over ${AI_USAGE_FLAG.customer.chats} messages or ${AI_USAGE_FLAG.customer.searches} searches in a day, a visitor over ${AI_USAGE_FLAG.visitor.chats} or ${AI_USAGE_FLAG.visitor.searches}, anyone turned away, or one visitor IP with more than 3 cookies.`}
        flush
      >
        {people.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-tm-text-2">Nobody used the assistant on this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-tm-hairline text-[12px] text-tm-text-2">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Who</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Messages</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Searches</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Turned away</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Tokens</th>
                  <th className="px-5 py-2.5 font-semibold">Active (Accra)</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.key} className={cn("border-b border-tm-hairline last:border-0", p.flagged && "bg-tm-tint")}>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-semibold text-tm-ink">
                          {p.kind === "customer" ? (p.name ?? p.email ?? "Customer") : `Visitor · ${p.key.replace(/^(ip|session):/, "").slice(0, 8)}`}
                          {p.flagged ? <AdminBadge tone="coral">Look</AdminBadge> : null}
                        </span>
                        <span className="text-[12px] text-tm-text-3">
                          {p.kind === "customer" ? (p.email ?? "Signed in") : `Not signed in · ${p.sessions} ${p.sessions === 1 ? "cookie" : "cookies"}`}
                        </span>
                      </div>
                    </td>
                    <td className="tm-nums px-3 py-3 text-right font-semibold">{n(p.chats)}</td>
                    <td className="tm-nums px-3 py-3 text-right font-semibold">{n(p.searches)}</td>
                    <td className={cn("tm-nums px-3 py-3 text-right font-semibold", p.refused > 0 && "text-tm-coral-strong")}>{n(p.refused)}</td>
                    <td className="tm-nums px-3 py-3 text-right text-tm-text-2">{n(p.inputTokens + p.outputTokens)}</td>
                    <td className="tm-nums px-5 py-3 text-tm-text-2">
                      {time(p.first)}–{time(p.last)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
