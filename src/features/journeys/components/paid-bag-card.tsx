import { CalendarCheck, CheckCircle } from "@phosphor-icons/react/ssr";

import { formatGhs } from "@/features/marketing/format";

export interface PaidBagCardProps {
  valueGhs: number;
  numItems: number;
  /** The window promised at payment, already formatted; null hides the line. */
  promiseText: string | null;
}

/**
 * Where a paid bag lands (Seamless Roadmap, Initiative 2): it is paid, for how
 * much, and when to expect it. The first stage of the two-stage date: the usual
 * window from today, then a firm date once the store ships. Replaces the toast,
 * which said "paid" and vanished before anyone could read when it would come.
 */
export function PaidBagCard({ valueGhs, numItems, promiseText }: PaidBagCardProps) {
  return (
    <section
      role="status"
      data-testid="paid-bag-card"
      className="tm-up flex flex-col gap-4 rounded-[24px] border border-tm-green/25 bg-tm-green-bg p-5 [animation-duration:0.5s] sm:p-[22px]"
    >
      <div className="flex items-start gap-3">
        <CheckCircle weight="fill" className="mt-0.5 size-6 shrink-0 text-tm-green" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight font-bold">Payment received. We are on it.</h2>
          <p className="tm-nums mt-1 text-sm leading-snug text-tm-text-2">
            {formatGhs(valueGhs)} for {numItems} {numItems === 1 ? "item" : "items"}. Next, we buy {numItems === 1 ? "it" : "them"} from the store.
          </p>
        </div>
      </div>

      {promiseText && (
        <div className="flex items-start gap-3 rounded-2xl bg-card px-4 py-3">
          <CalendarCheck weight="duotone" className="mt-0.5 size-5 shrink-0 text-tm-green" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] leading-none font-medium text-tm-text-3">Estimated delivery</p>
            <p className="tm-nums mt-1.5 text-[15px] leading-tight font-semibold" data-testid="paid-bag-promise">
              {promiseText}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-tm-text-2">
              Our usual window from today. As soon as the store ships, we send you a firm date with the flight it is booked on.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
