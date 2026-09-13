import Link from "next/link";
import { Tote } from "@phosphor-icons/react/ssr";

/** The bag with nothing in it: a way back to the paste bar, nothing invented. */
export function BagEmpty() {
  return (
    <section className="tm-up flex flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-14 text-center [animation-duration:0.5s]">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-tint text-tm-coral">
        <Tote weight="duotone" className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-xl leading-none font-bold">Your bag is empty</h2>
        <p className="text-sm leading-[1.5] text-tm-text-2">Paste a link to see the landed price, then add it here.</p>
      </div>
      <Link
        href="/app/orders/new"
        className="tm-cta-gradient inline-flex h-11 items-center justify-center rounded-[14px] px-5 text-sm leading-none font-bold text-white"
      >
        Paste a link
      </Link>
    </section>
  );
}
