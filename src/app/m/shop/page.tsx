import { ArrowRight, CaretLeft, MagnifyingGlass, ShieldCheck, Star, Storefront, X } from "@phosphor-icons/react/ssr";

import { listBrowsableCategories } from "@/features/catalog/services/catalog-search.service";
import { getShopDepartmentGroups, getShopPage, type ShopDepartmentGroup, type ShopProduct } from "@/features/catalog/services/catalog-shop.service";
import { isGroupedView, parseShopParams, type ShopSearchParams, type ShopSort, type ShopState } from "@/features/catalog/shop-params";
import { departmentImage } from "@/features/catalog/components/department-images";
import { resolveCatalogQuery } from "@/features/catalog/components/format";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { Tap } from "@/features/mobile/components/tap";
import { ghs0, storeLabel } from "@/features/mobile/format";
import { mobileShopHref } from "@/features/mobile/shop-href";
import { compactCount, distinctByTitle, shortCategory } from "@/features/mobile/shop-format";

/** Products per department read for the front page; shelves keep the distinct ones. */
const SHELF_READ = 10;
const SHELF_SHOW = 8;
const SHELVES = 8;

const SORTS: { value: ShopSort; label: string }[] = [
  { value: "recommended", label: "Best match" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
  { value: "rating", label: "Top rated" },
  { value: "newest", label: "Newest" },
];

/**
 * Shop: what we have already priced to the door, as a storefront. The same catalogue, the same
 * calculator and the same query names as the website's Browse. A render never writes.
 */
export default async function MobileShopPage({ searchParams }: { searchParams: Promise<ShopSearchParams> }) {
  const params = await searchParams;
  let categories: { category: string; count: number }[] = [];
  try {
    categories = (await listBrowsableCategories()).filter((c) => c.count > 0);
  } catch (error) {
    logger.error("m/shop: could not list catalogue categories", { error: error instanceof Error ? error.message : String(error) });
  }
  const departments = categories.map((c) => c.category);
  const query = resolveCatalogQuery(params.q);
  const state: ShopState = { ...parseShopParams(params, departments), q: query.kind === "ready" ? query.query : "" };
  const grouped = isGroupedView(state);

  return (
    <>
      <div className="shop-top">
        {grouped ? (
          <h1 className="shop-title">Shop</h1>
        ) : (
          <Tap href="/m/shop" haptic="light" className="shop-back"><CaretLeft size={18} weight="bold" />Shop</Tap>
        )}
        <form action="/m/shop" className="shop-search">
          <MagnifyingGlass size={19} weight="bold" />
          <input name="q" defaultValue={state.q} placeholder="Search Amazon, eBay, Walmart…" enterKeyHint="search" aria-label="Search the shop" autoComplete="off" />
          {state.category && <input type="hidden" name="category" value={state.category} />}
        </form>
      </div>

      <div className="cat-chips">
        {categories.map(({ category }) => {
          const on = state.category === category;
          const photo = departmentImage(category);
          return (
            <Tap key={category} href={mobileShopHref(on ? { ...state, category: null } : { ...state, q: "", category })} haptic="select" className={cn("cat-chip", on && "on")}>
              {photo ? <img src={photo.src} alt="" /> : <span className="ph"><Storefront size={14} weight="fill" /></span>}
              {shortCategory(category)}
            </Tap>
          );
        })}
      </div>

      {grouped ? <Front categories={categories} /> : <Results state={state} />}
    </>
  );
}

/** The front page: a mixed "Popular now" row, a few department shelves, then every category. */
async function Front({ categories }: { categories: { category: string; count: number }[] }) {
  const groups = await getShopDepartmentGroups(SHELF_READ).catch(() => [] as ShopDepartmentGroup[]);
  if (groups.length === 0) return <Empty />;
  const shelves = groups
    .map((g) => ({ ...g, products: distinctByTitle(g.products.filter(priced)).slice(0, SHELF_SHOW) }))
    .filter((g) => g.products.length >= 2);
  // One from each department, the best-rated first: variety rather than four of the same thing.
  const score = (p: ShopProduct) => (p.rating ?? 0) * Math.log10((p.review_count ?? 0) + 10);
  const popular = shelves.map((g) => [...g.products].sort((a, b) => score(b) - score(a))[0]!).slice(0, 10);
  const allOf = (category: string) => mobileShopHref({ ...parseShopParams({}), category: category || null });

  return (
    <>
      <p className="shop-trust"><ShieldCheck size={15} weight="fill" />Every price is to your door in Accra: tax, freight and customs included.</p>

      <div className="section-h"><h2>Popular now</h2></div>
      <div className="shelf-rail">{popular.map((p) => <Card key={p.id} p={p} size="lg" />)}</div>

      {shelves.slice(0, SHELVES).map((g) => (
        <section key={g.category}>
          <div className="section-h">
            <h2>{shortCategory(g.category || "More")}</h2>
            <Tap href={allOf(g.category)} className="link">See all</Tap>
          </div>
          <div className="shelf-rail">
            {g.products.map((p) => <Card key={p.id} p={p} />)}
            <Tap href={allOf(g.category)} className="sc see-all">
              <span><ArrowRight size={20} weight="bold" /></span>
              See all {compactCount(g.count)}
            </Tap>
          </div>
        </section>
      ))}

      <div className="section-h"><h2>All categories</h2></div>
      <div className="cat-grid">
        {categories.map(({ category, count }) => {
          const photo = departmentImage(category);
          return (
            <Tap key={category} href={allOf(category)} className="cat-tile">
              {photo ? <img src={photo.src} alt="" loading="lazy" /> : <span className="ph"><Storefront size={28} /></span>}
              <span className="lbl"><b>{shortCategory(category)}</b><small>{compactCount(count)} items</small></span>
            </Tap>
          );
        })}
      </div>
    </>
  );
}

/** A category, a search or a filter: sort and narrow at the top, a two-column grid, more below. */
async function Results({ state }: { state: ShopState }) {
  const page = await getShopPage(state).catch(() => null);
  if (!page) return <Empty />;
  const stores = page.facets.stores.filter((s) => s.count > 0);
  const prices = page.facets.prices.filter((p) => p.count > 0);

  return (
    <>
      <div className="results-head">
        <h1>{state.q ? `“${state.q}”` : state.category ? shortCategory(state.category) : "Everything"}</h1>
        <p>{page.total.toLocaleString("en-GH")} {page.total === 1 ? "product" : "products"} priced to your door</p>
      </div>

      <div className="chips-row">
        {(state.stores.length > 0 || state.minGhs != null || state.maxGhs != null || state.sort !== "recommended") && (
          <Tap href={mobileShopHref(state, { stores: [], minGhs: null, maxGhs: null, sort: "recommended" })} haptic="select" className="fchip clear" scroll={false}>
            <X size={13} weight="bold" />Reset
          </Tap>
        )}
        {SORTS.map((s) => (
          <Tap key={s.value} href={mobileShopHref(state, { sort: s.value })} haptic="select" className={cn("fchip", state.sort === s.value && "on")} scroll={false}>
            {s.label}
          </Tap>
        ))}
      </div>
      {(prices.length > 1 || stores.length > 1) && (
        <div className="chips-row" style={{ paddingTop: 0 }}>
          {prices.map((p) => {
            const on = state.minGhs === p.bucket.min && state.maxGhs === p.bucket.max;
            return (
              <Tap key={p.bucket.index} href={mobileShopHref(state, on ? { minGhs: null, maxGhs: null } : { minGhs: p.bucket.min, maxGhs: p.bucket.max })} haptic="select" className={cn("fchip", on && "on")} scroll={false}>
                {p.bucket.label}
              </Tap>
            );
          })}
          {stores.length > 1 &&
            stores.map((s) => {
              const on = state.stores.includes(s.value);
              return (
                <Tap key={s.value} href={mobileShopHref(state, { stores: on ? state.stores.filter((x) => x !== s.value) : [...state.stores, s.value] })} haptic="select" className={cn("fchip", on && "on")} scroll={false}>
                  {storeLabel(s.value)}
                </Tap>
              );
            })}
        </div>
      )}

      {page.kind === "past-end" || page.products.length === 0 ? (
        <Empty searched />
      ) : (
        <>
          <div className="grid2">{page.products.map((p) => <Card key={p.id} p={p} size="grid" />)}</div>
          <div className="pager">
            {page.page > 1 ? <Tap href={mobileShopHref(state, { page: page.page - 1 })} className="btn btn-ghost">Previous</Tap> : <span />}
            <span className="muted" style={{ fontSize: 13 }}>{page.page} of {page.pageCount}</span>
            {page.page < page.pageCount ? <Tap href={mobileShopHref(state, { page: page.page + 1 })} className="btn btn-dark">More</Tap> : <span />}
          </div>
        </>
      )}
    </>
  );
}

const priced = (p: ShopProduct) => p.total_ghs != null && !p.unpriceable && !!p.image_url;

/** A product: picture on white with the store on it, two lines of title, rating, the landed price. */
function Card({ p, size = "md" }: { p: ShopProduct; size?: "md" | "lg" | "grid" }) {
  return (
    <Tap href={`/m/price?url=${encodeURIComponent(p.product_url)}`} className={cn("sc", size)}>
      <span className="sc-img">
        {p.image_url ? <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Storefront size={28} />}
        <span className="sc-store">{storeLabel(p.store)}</span>
      </span>
      <span className="sc-t">{p.title}</span>
      {p.rating != null && p.rating > 0 && (
        <span className="sc-r"><Star size={12} weight="fill" />{p.rating.toFixed(1)}{p.review_count ? <small>({compactCount(p.review_count)})</small> : null}</span>
      )}
      <span className="sc-p nums">{p.total_ghs != null && !p.unpriceable ? ghs0(p.total_ghs) : "Tap to price"}</span>
    </Tap>
  );
}

function Empty({ searched = false }: { searched?: boolean }) {
  return (
    <div className="empty">
      <Storefront size={48} />
      <h3>{searched ? "Nothing priced for that yet" : "The shop is restocking"}</h3>
      <p>Buy for me can find it in any US store and price it to your door.</p>
      <Tap href="/m/chat" className="btn btn-primary">Ask Buy for me</Tap>
    </div>
  );
}
