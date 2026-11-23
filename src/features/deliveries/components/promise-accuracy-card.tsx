import Link from "next/link";

import { AdminCard } from "@/components/layout/admin/admin-page";
import { planDay } from "@/features/journeys/delivery-plan";

import { describeScore, type PromiseAccuracy, type PromiseKind } from "../promise-accuracy";

/**
 * Were the delivery promises kept? (Seamless Roadmap, Initiative 2.) The
 * estimate at payment, the first firm date and the last one, each against the
 * day the order was delivered, plus the latest late orders.
 */

const ROWS: Array<{ kind: PromiseKind; label: string; hint: string }> = [
  { kind: "estimate", label: "Estimate at payment", hint: "The usual window, promised the day they paid" },
  { kind: "firstFirm", label: "First firm date", hint: "Given with the store's tracking" },
  { kind: "lastFirm", label: "Last firm date", hint: "After any flight move or cancel" },
];

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** "late ones 2 days late" when they were all equally late, else the average and the worst. */
function lateness(avg: number, max: number): string {
  return avg === max ? `late ones ${days(max)} late` : `late ones ${days(avg)} late on average, ${days(max)} at most`;
}

export function PromiseAccuracyCard({ accuracy, windowDays, index = 0 }: { accuracy: PromiseAccuracy; windowDays: number; index?: number }) {
  const anyGiven = ROWS.some((r) => accuracy.scores[r.kind].given > 0);
  return (
    <AdminCard
      index={index}
      title="Delivery promises kept"
      blurb={`Orders delivered in the last ${windowDays} days, against the date we gave them. Delivered on or before the date counts as kept.`}
    >
      {!anyGiven ? (
        <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2" data-testid="promise-accuracy-empty">
          {accuracy.delivered === 0
            ? `No order was delivered in the last ${windowDays} days.`
            : `${accuracy.delivered} ${accuracy.delivered === 1 ? "order was" : "orders were"} delivered, but none was paid after promises began (23 Nov 2026). The first numbers come with the first of those deliveries.`}
        </p>
      ) : (
        <div className="flex flex-col gap-5" data-testid="promise-accuracy">
          <dl className="grid gap-3 sm:grid-cols-3">
            {ROWS.map((row) => {
              const s = accuracy.scores[row.kind];
              const line = describeScore(s);
              const pct = s.given ? s.kept / s.given : null;
              return (
                <div key={row.kind} className="rounded-[14px] bg-tm-paper p-4">
                  <dt className="text-[12px] font-semibold text-tm-text-2">{row.label}</dt>
                  <dd className="mt-1">
                    <p
                      className={
                        "font-display text-[22px] leading-tight font-bold " +
                        (pct == null ? "text-tm-text-3" : pct >= 0.9 ? "text-tm-green-ink" : pct >= 0.7 ? "text-[#7a4a06]" : "text-tm-coral-strong")
                      }
                    >
                      {pct == null ? "—" : `${Math.round(pct * 100)}%`}
                    </p>
                    <p className="text-[12px] leading-[1.5] font-medium text-tm-text-2">
                      {line ?? "Not given yet"}
                      {s.avgDaysLate != null && s.maxDaysLate != null && ` · ${lateness(s.avgDaysLate, s.maxDaysLate)}`}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-tm-text-3">{row.hint}</p>
                  </dd>
                </div>
              );
            })}
          </dl>

          <p className="text-[13px] font-medium text-tm-text-2">
            {accuracy.redated === 0
              ? "No delivered order had its firm date changed by a flight move."
              : `${accuracy.redated} delivered ${accuracy.redated === 1 ? "order was" : "orders were"} re-dated by a flight move or cancel.`}
          </p>

          {accuracy.late.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-tm-ink">Latest late deliveries</h3>
              <ul className="flex flex-col divide-y divide-tm-hairline text-[13px]">
                {accuracy.late.map((o) => (
                  <li key={o.orderId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                    <Link href={`/admin/orders/${o.orderId}`} className="font-semibold text-tm-ink hover:text-tm-coral-strong">
                      {o.orderNo}
                    </Link>
                    <span className="font-medium text-tm-text-2">
                      {o.promise === "firm" ? "Firm date" : "Estimate"} {planDay(o.promisedOn)} · delivered {planDay(o.deliveredOn)} ·{" "}
                      <span className="text-tm-coral-strong">{days(o.daysLate)} late</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </AdminCard>
  );
}
