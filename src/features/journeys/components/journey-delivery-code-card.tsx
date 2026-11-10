import { ShieldCheck } from "@phosphor-icons/react/ssr";

/**
 * "Your delivery code" (102). The driver, or your own rider at our warehouse,
 * asks for it when they hand the parcel over, and nothing is marked delivered
 * without it. Digits only, formatted for reading out: "482 913".
 */
export function JourneyDeliveryCodeCard({ code }: { code: string }) {
  return (
    <section className="tm-up flex items-center gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.04s] [animation-duration:0.5s]">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-tm-pill-bg">
        <ShieldCheck weight="duotone" className="size-7 text-tm-coral" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-none font-semibold tracking-[0.04em] text-tm-text-3 uppercase">Your delivery code</p>
        <p className="tm-nums font-display mt-1.5 text-[30px] leading-none font-bold tracking-[0.12em] text-tm-ink" aria-label={`Delivery code ${code.split("").join(" ")}`}>
          {code.slice(0, 3)} {code.slice(3)}
        </p>
        <p className="mt-2 text-[13px] leading-[1.45] text-tm-text-2">
          Give it to the driver when they hand you the parcel. Don&apos;t share it before then.
        </p>
      </div>
    </section>
  );
}
