import type { OrderEventRow } from "@/db/queries/order-events";
import { noteFor } from "@/features/orders/services/journey-track";
import { formatEventStamp } from "../format";

export interface JourneyUpdatesCardProps {
  updates: OrderEventRow[];
}

/**
 * "Updates" (`v2-detail`, design lines 349–354) — the customer-readable log.
 *
 * Every line is one `order_events` row: its own wording, its own timestamp, and
 * the location/weight it carries. `audit_logs` is NOT the source — it is
 * admin-read-only and machine-worded; see migration 050 for why the two logs are
 * separate.
 *
 * An order with no events shows one honest sentence instead of the mock's four
 * sample lines. That is the common case right after payment, and it is better
 * than inventing a "we have received your order" line nobody wrote.
 */
export function JourneyUpdatesCard({ updates }: JourneyUpdatesCardProps) {
  return (
    <section className="tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.1s] [animation-duration:0.5s]">
      <h2 className="font-display text-lg leading-none font-bold">Updates</h2>

      {updates.length === 0 ? (
        <p className="text-[13px] leading-[1.5] font-normal text-tm-text-2">
          Nothing to report yet. Every step (purchased, at our hub, in the air)
          appears here as it happens.
        </p>
      ) : (
        <ol className="flex flex-col">
          {updates.map((event, index) => {
            const note = noteFor(event);
            const notLast = index < updates.length - 1;
            return (
              <li key={event.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3">
                <div className="flex flex-col items-center">
                  {/*
                    The newest event is the live one and takes the coral dot;
                    everything behind it is settled and green. The mock hardcodes
                    which is which, but "the top one" is what it is drawing.
                  */}
                  <span
                    className={`mt-[5px] size-2.5 shrink-0 rounded-full ${
                      index === 0 ? "bg-tm-coral" : "bg-tm-green"
                    }`}
                  />
                  {notLast && <span className="my-1 w-0.5 flex-1 bg-[#F5EEE9]" />}
                </div>
                <div className="min-w-0 pb-4">
                  <p className="text-[13px] leading-[1.3] font-semibold break-words">
                    {event.title}
                    {note && <span className="text-tm-text-2"> · {note}</span>}
                  </p>
                  <p className="mt-0.5 text-xs leading-[1.4] font-normal text-tm-text-3">
                    {formatEventStamp(event.occurred_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
