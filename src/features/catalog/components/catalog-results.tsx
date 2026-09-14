import Link from "next/link";
import {
  ArrowRight,
  LinkSimple,
  MagnifyingGlass,
  Storefront,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { CatalogProduct } from "../types";
import { CatalogProductCard } from "./catalog-product-card";

/**
 * The grid of results.
 *
 * The single-column track below `sm` spells its own zero floor out rather than
 * leaning on the numbered utility: an implicit grid column's floor is its
 * content's min-content width, and a product title clamped to two lines still
 * reports its longest word as that minimum. Without the zero floor one card
 * widens the whole page past the phone. Tailwind's numbered column utilities
 * already carry the same floor, so the wider breakpoints are safe as written.
 */
export function CatalogResultsGrid({
  results,
  now,
  className,
}: {
  results: readonly CatalogProduct[];
  now: Date;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {results.map((product) => (
        <CatalogProductCard key={product.id} product={product} now={now} />
      ))}
    </ul>
  );
}

/**
 * The screen before anyone has typed. No sample products: a made-up product on
 * a price screen is a made-up price, and one that leads nowhere is worse.
 *
 * It explains the two halves of the feature instead, because the catalogue is
 * not everything Tomame can buy and a customer who assumes it is will give up
 * on the thing they actually wanted.
 */
export function CatalogIdleState() {
  return (
    <section className="tm-up flex flex-col gap-6 rounded-[24px] border border-tm-border bg-card px-6 py-10 sm:px-8 [animation-delay:0.08s]">
      <span className="flex size-12 items-center justify-center rounded-[14px] bg-tm-tint text-tm-coral">
        <MagnifyingGlass weight="duotone" className="size-6" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[19px] leading-[1.25] font-bold">
          Search without a link
        </h2>
        <p className="max-w-[56ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Type what you are after and we will show you products we have already
          priced, cheapest first, with the full cedi total worked out: item, US
          sales tax, our fee and freight.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        <li className="flex flex-col gap-1.5">
          <Storefront weight="duotone" className="size-5 text-tm-coral" aria-hidden />
          <p className="text-[13px] leading-[1.3] font-semibold">
            A head start, not a catalogue
          </p>
          <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
            These are products we have already read and priced from Amazon and
            eBay. It is a small slice of what is out there, and it grows as
            people search.
          </p>
        </li>
        <li className="flex flex-col gap-1.5">
          <LinkSimple weight="duotone" className="size-5 text-tm-coral" aria-hidden />
          <p className="text-[13px] leading-[1.3] font-semibold">
            Anything else, paste the link
          </p>
          <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
            We buy from every store we support, not just these two. Paste a
            product link and we will price that exact item for you.
          </p>
        </li>
      </ul>

      <PasteLinkLink label="Paste a link instead" />
    </section>
  );
}

/**
 * Typed, but not yet enough to search on. The number comes from the config the
 * server validates against, so the two can never disagree.
 */
export function CatalogQueryTooShort({ minLength }: { minLength: number }) {
  return (
    <section className="tm-up flex flex-col gap-2 rounded-[24px] border border-tm-border bg-card px-6 py-10 text-center [animation-delay:0.08s]">
      <h2 className="font-display text-[19px] leading-[1.25] font-bold">
        Keep typing
      </h2>
      <p className="mx-auto max-w-[46ch] text-sm leading-[1.5] font-medium text-tm-text-2">
        Searches need at least {minLength} characters. Try the kind of thing you
        would say out loud, like &ldquo;wireless earbuds&rdquo;.
      </p>
    </section>
  );
}

/**
 * A real search that found nothing. It says so plainly and offers the path that
 * does work, which is pasting the link to the exact product.
 */
/**
 * The search itself failed.
 *
 * NOT the same thing as "nothing matched", and it must not be dressed as it: a
 * customer told "nothing priced for that yet" when the database blinked will
 * stop looking for a product we do have. This says we could not look, and points
 * at the paste flow, which is a different code path and is probably still up.
 */
export function CatalogSearchUnavailable() {
  return (
    <section className="tm-up flex flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center [animation-delay:0.08s]">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-tint text-tm-coral">
        <MagnifyingGlass weight="duotone" className="size-7" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] leading-[1.2] font-bold">
          We could not run that search
        </h2>
        <p className="mx-auto max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Something on our side is not answering. Nothing is wrong with what you
          typed: try again in a moment, or paste the link to the product you want
          and we will price that one directly.
        </p>
      </div>

      <PasteLinkLink label="Paste a product link" />
    </section>
  );
}

export function CatalogNoMatches({ query }: { query: string }) {
  return (
    <section className="tm-up flex flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center [animation-delay:0.08s]">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-tint text-tm-coral">
        <MagnifyingGlass weight="duotone" className="size-7" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] leading-[1.2] font-bold">
          Nothing priced for &ldquo;{query}&rdquo; yet
        </h2>
        <p className="mx-auto max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          We have not read a product matching that yet. That does not mean we
          cannot buy it: paste the link to the one you want and we will price
          that exact item, usually in under a minute.
        </p>
      </div>

      <PasteLinkLink label="Paste a product link" />
    </section>
  );
}

/** The one action every empty state on this screen should offer. */
function PasteLinkLink({ label }: { label: string }) {
  return (
    <Link
      href="/app/orders/new"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {label}
      <ArrowRight weight="bold" className="size-3.5" aria-hidden />
    </Link>
  );
}
