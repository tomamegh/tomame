import Link from "next/link";
import { Check, Star } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { ShopFacets } from "../../services/catalog-shop.service";
import {
  activePriceBucket,
  conditionLabel,
  shopHref,
  toggleCondition,
  toggleStore,
  type ShopState,
} from "../../shop-params";
import { CATALOG_STORE_LABEL } from "../format";
import { ShopPriceRangeForm } from "./shop-price-range-form";

/**
 * The desktop sidebar: every facet the catalogue can back, as links.
 *
 * LINKS, NOT CHECKBOXES THAT WAIT FOR "APPLY". On a desktop the grid is right
 * beside the sidebar, so each press answers at once — a navigation the server
 * renders, with the new counts beside every other option. The phone's sheet
 * collects several choices before one submit instead (`ShopFilterSheet`),
 * because there the grid is hidden behind it.
 *
 * WHAT IS HERE IS WHAT THE DATA HOLDS. Department is `catalog_products.category`;
 * store is the two stores the scraper reads; condition is eBay's own listing
 * condition, normalised (Amazon rows carry none, so the group says "eBay
 * listings"); price is the calculator's stored landed total; rating is Amazon's
 * star rating. An option with nothing behind it under the other filters is
 * drawn disabled with a zero rather than hidden, so the list does not jump —
 * except a whole group with nothing in it, which is left out.
 */
export function ShopFacetSidebar({
  state,
  facets,
}: {
  state: ShopState;
  facets: ShopFacets;
}) {
  const priceBucket = activePriceBucket(state);
  const conditionsHeld =
    facets.conditions.some((c) => c.count > 0) || state.conditions.length > 0;
  const ratingsHeld =
    facets.ratings.some((r) => r.count > 0) || state.rating != null;
  const pricesHeld =
    facets.prices.some((p) => p.count > 0) ||
    state.minGhs != null ||
    state.maxGhs != null;

  return (
    <div className="flex flex-col gap-6">
      <FacetGroup title="Categories">
        <FacetLink
          href={shopHref(state, { category: null })}
          active={state.category == null}
          label="All categories"
          kind="radio"
        />
        {facets.departments.map((d) => (
          <FacetLink
            key={d.value}
            href={shopHref(state, { category: d.value })}
            active={state.category === d.value}
            label={d.value}
            count={d.count}
            kind="radio"
          />
        ))}
      </FacetGroup>

      <FacetGroup title="Store">
        {facets.stores.map((s) => (
          <FacetLink
            key={s.value}
            href={shopHref(state, toggleStore(state, s.value))}
            active={state.stores.includes(s.value)}
            label={CATALOG_STORE_LABEL[s.value]}
            count={s.count}
            kind="check"
          />
        ))}
      </FacetGroup>

      {pricesHeld && (
        <FacetGroup title="Price, landed in GH₵">
          {facets.prices.map((p) => (
            <FacetLink
              key={p.value}
              href={
                priceBucket?.index === p.value
                  ? shopHref(state, { minGhs: null, maxGhs: null })
                  : shopHref(state, {
                      minGhs: p.bucket.min,
                      maxGhs: p.bucket.max,
                    })
              }
              active={priceBucket?.index === p.value}
              label={p.bucket.label}
              count={p.count}
              kind="radio"
            />
          ))}
          <ShopPriceRangeForm
            state={state}
            range={facets.range}
            idPrefix="sidebar"
            className="mt-2"
          />
        </FacetGroup>
      )}

      {ratingsHeld && (
        <FacetGroup title="Rating" note="Amazon listings">
          {facets.ratings.map((r) => (
            <FacetLink
              key={r.value}
              href={shopHref(state, {
                rating: state.rating === r.value ? null : r.value,
              })}
              active={state.rating === r.value}
              label={
                <span className="inline-flex items-center gap-1">
                  {r.value}
                  <Star
                    weight="fill"
                    className="size-3 text-tm-coral"
                    aria-hidden
                  />
                  <span>&amp; up</span>
                  <span className="sr-only">stars</span>
                </span>
              }
              count={r.count}
              kind="radio"
            />
          ))}
        </FacetGroup>
      )}

      {conditionsHeld && (
        <FacetGroup title="Condition" note="eBay listings">
          {facets.conditions.map((c) => (
            <FacetLink
              key={c.value}
              href={shopHref(state, toggleCondition(state, c.value))}
              active={state.conditions.includes(c.value)}
              label={conditionLabel(c.value)}
              count={c.count}
              kind="check"
            />
          ))}
        </FacetGroup>
      )}
    </div>
  );
}

function FacetGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="mb-1.5 flex items-baseline justify-between gap-2 font-sans text-[12px] leading-none font-bold tracking-[0.04em] text-tm-text-3 uppercase">
        {title}
        {note && (
          <span className="text-[11px] font-medium tracking-normal normal-case">
            {note}
          </span>
        )}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function FacetLink({
  href,
  active,
  label,
  count,
  kind,
}: {
  href: string;
  active: boolean;
  label: React.ReactNode;
  count?: number;
  kind: "check" | "radio";
}) {
  const empty = count === 0 && !active;
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "true" : undefined}
        aria-disabled={empty || undefined}
        tabIndex={empty ? -1 : undefined}
        className={cn(
          "group flex min-h-9 items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[13.5px] leading-[1.25] font-medium text-tm-ink transition-colors",
          "hover:bg-tm-tint focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none",
          active && "font-semibold",
          empty && "pointer-events-none text-tm-text-3",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center border-[1.5px] transition-colors",
            kind === "check" ? "rounded-[5px]" : "rounded-full",
            active
              ? "border-tm-coral bg-tm-coral text-white"
              : "border-tm-border bg-card group-hover:border-tm-coral/60",
          )}
        >
          {active &&
            (kind === "check" ? (
              <Check weight="bold" className="size-2.5" />
            ) : (
              <span className="size-1.5 rounded-full bg-white" />
            ))}
        </span>
        <span className="min-w-0 flex-1 break-words">{label}</span>
        {count != null && (
          <span className="tm-nums shrink-0 text-[12px] text-tm-text-3">
            {count}
          </span>
        )}
      </Link>
    </li>
  );
}
