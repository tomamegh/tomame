import { MagnifyingGlass, Storefront, X } from "@phosphor-icons/react/ssr";

import { listBrowsableCategories } from "@/features/catalog/services/catalog-search.service";
import { getShopDepartmentGroups, getShopPage, type ShopProduct } from "@/features/catalog/services/catalog-shop.service";
import { isGroupedView, parseShopParams, SHOP_SORTS, type ShopSearchParams, type ShopState } from "@/features/catalog/shop-params";
import { departmentImage } from "@/features/catalog/components/department-images";
import { resolveCatalogQuery } from "@/features/catalog/components/format";
import { logger } from "@/lib/logger";
import { Tap } from "@/features/mobile/components/tap";
import { StoreTag } from "@/features/mobile/components/bits";
import { ghs0, storeLabel } from "@/features/mobile/format";
import { mobileShopHref } from "@/features/mobile/shop-href";

/**
 * Shop: everything we have already priced to the door, the website's Browse in the app.
 * The same catalogue, the same calculator and the same query names as `/app/orders/new?mode=browse`.
 * A render never writes; the catalogue cron keeps the figures fresh.
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
      <div className="lt"><div><h1>Shop</h1><p>Already priced to your door in Accra</p></div></div>

      <form action="/m/shop" className="shop-search">
        <MagnifyingGlass size={19} />
        <input name="q" defaultValue={state.q} placeholder="Search what we've priced" enterKeyHint="search" aria-label="Search the shop" />
        {state.category && <input type="hidden" name="category" value={state.category} />}
      </form>

      {departments.length > 0 && (
        <div className="depts-row">
          {departments.map((d) => {
            const photo = departmentImage(d);
            const on = state.category === d;
            return (
              <Tap key={d} href={mobileShopHref(state, { category: on ? null : d })} haptic="select" className={on ? "dept on" : "dept"} scroll={false}>
                <span className="c">
                  {photo ? (
                    <img src={photo.src} alt="" loading="lazy" />
                  ) : (
                    <Storefront size={26} />
                  )}
                </span>
                {d}
              </Tap>
            );
          })}
        </div>
      )}

      {grouped ? <Shelves /> : <Results state={state} />}
    </>
  );
}

/** First view: a few products from each department, with "See all". */
async function Shelves() {
  const groups = await getShopDepartmentGroups().catch(() => []);
  if (groups.length === 0) return <Empty />;
  return (
    <>
      {groups.map((g) => (
        <section key={g.category}>
          <div className="section-h">
            <h2>{g.category || "More"}</h2>
            <Tap href={mobileShopHref({ ...emptyState(), category: g.category || null })} className="link">See all {g.count}</Tap>
          </div>
          <div className="pgrid">{g.products.map((p) => <Product key={p.id} p={p} />)}</div>
        </section>
      ))}
    </>
  );
}

/** A search, a department or a filter: one page of results, with store and sort chips. */
async function Results({ state }: { state: ShopState }) {
  const page = await getShopPage(state).catch(() => null);
  if (!page) return <Empty />;
  const stores = page.facets.stores.filter((s) => s.count > 0);
  return (
    <>
      <div className="chips-row">
        {(state.q || state.category || state.stores.length > 0 || state.sort !== "recommended") && (
          <Tap href="/m/shop" haptic="select" className="fchip clear"><X size={13} weight="bold" />Clear</Tap>
        )}
        {stores.map((s) => {
          const on = state.stores.includes(s.value);
          return (
            <Tap key={s.value} href={mobileShopHref(state, { stores: on ? state.stores.filter((x) => x !== s.value) : [...state.stores, s.value] })} haptic="select" className={on ? "fchip on" : "fchip"} scroll={false}>
              {storeLabel(s.value)} <span>{s.count}</span>
            </Tap>
          );
        })}
        {SHOP_SORTS.filter((s) => s.value === "price_asc" || s.value === "price_desc" || s.value === "newest").map((s) => {
          const on = state.sort === s.value;
          return (
            <Tap key={s.value} href={mobileShopHref(state, { sort: on ? "recommended" : s.value })} haptic="select" className={on ? "fchip on" : "fchip"} scroll={false}>
              {s.label}
            </Tap>
          );
        })}
      </div>

      {page.kind === "past-end" || page.products.length === 0 ? (
        <Empty searched />
      ) : (
        <>
          <p className="fine" style={{ textAlign: "left", margin: "4px 20px 10px" }}>
            {page.total.toLocaleString("en-GH")} {page.total === 1 ? "product" : "products"}
            {state.q ? ` for “${state.q}”` : ""}
            {state.category ? ` in ${state.category}` : ""}
          </p>
          <div className="pgrid">{page.products.map((p) => <Product key={p.id} p={p} />)}</div>
          {page.pageCount > 1 && (
            <div className="pager">
              {page.page > 1 ? <Tap href={mobileShopHref(state, { page: page.page - 1 })} className="btn btn-ghost">Previous</Tap> : <span />}
              <span className="fine" style={{ margin: 0 }}>Page {page.page} of {page.pageCount}</span>
              {page.page < page.pageCount ? <Tap href={mobileShopHref(state, { page: page.page + 1 })} className="btn btn-ghost">Next</Tap> : <span />}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Product({ p }: { p: ShopProduct }) {
  const priced = p.total_ghs != null && !p.unpriceable;
  return (
    <Tap href={`/m/price?url=${encodeURIComponent(p.product_url)}`} className="pcard">
      <div className="img">
        {p.image_url ? <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
      </div>
      <StoreTag store={p.store} />
      <div className="t">{p.title}</div>
      <div className="p nums">{priced ? <>{ghs0(p.total_ghs!)}<small>all in</small></> : <small style={{ marginLeft: 0 }}>Tap to price</small>}</div>
    </Tap>
  );
}

function Empty({ searched = false }: { searched?: boolean }) {
  return (
    <div className="empty">
      <Storefront size={48} />
      <h3>{searched ? "Nothing priced for that yet" : "The shop is restocking"}</h3>
      <p>Buy for me can find it anywhere and price it to your door.</p>
      <Tap href="/m/chat" className="btn btn-primary">Ask Buy for me</Tap>
    </div>
  );
}

function emptyState(): ShopState {
  return parseShopParams({});
}
