import { MapPinLine, Moped, Phone } from "@phosphor-icons/react/ssr";

import { formatGhanaPhone } from "../schema";
import type { OrderCourier } from "../types";
import { providerName } from "./courier-format";

/**
 * "A rider has your package" — the customer's half of the last-mile hand-off
 * (migration 075), on `/app/orders/[id]`.
 *
 * No client state and no hooks, so it renders on the server or inside a client
 * tree alike. It draws nothing unless a rider was dispatched AND the order is
 * still in transit: once it is delivered the rider's number is a stranger's
 * phone, not a way to find a parcel.
 *
 * The phone and link were validated server-side (`courierHandoffSchema`): the
 * number is `+233XXXXXXXXX` and the link is https with no credentials, so both
 * are safe as `href`s.
 */
export function CourierCard({
  courier,
  orderStatus,
  className,
}: {
  courier: OrderCourier | null;
  orderStatus: string;
  className?: string;
}) {
  if (!courier || orderStatus !== "in_transit") return null;

  const via = providerName(courier.provider);

  return (
    <section
      aria-labelledby={`courier-${courier.orderId}`}
      className={[
        "tm-up flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-duration:0.5s]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-tm-pill-bg">
          <Moped weight="duotone" className="size-6 text-tm-coral" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs leading-none font-semibold tracking-[0.04em] text-tm-text-3 uppercase">
            Out for delivery
          </span>
          <h2 id={`courier-${courier.orderId}`} className="font-display text-lg leading-tight font-bold break-words">
            {courier.name ? `${courier.name} has your package` : "A rider has your package"}
          </h2>
          <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
            {via ? `On its way to you on ${via}.` : "On its way to you now."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
        {courier.phone ? (
          <a
            href={`tel:${courier.phone}`}
            className="flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] border border-tm-border px-4 text-[14px] leading-none font-bold text-tm-ink transition-colors hover:bg-tm-paper"
          >
            <Phone weight="bold" className="size-4 shrink-0" aria-hidden />
            <span className="tm-nums truncate">Call {formatGhanaPhone(courier.phone)}</span>
          </a>
        ) : null}
        {courier.trackingUrl ? (
          <a
            href={courier.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] bg-[image:var(--tm-gradient-cta)] px-4 text-[14px] leading-none font-bold text-white"
          >
            <MapPinLine weight="bold" className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{via ? `Track on ${via}` : "Track your rider"}</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
