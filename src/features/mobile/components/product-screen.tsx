"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellSimpleRinging, CalendarCheck, CaretDown, ShoppingBagOpen, LockSimple, Minus, Plus, Scales, ShareNetwork, Star, WarningCircle } from "@phosphor-icons/react";

import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import { haptic, share } from "@/lib/native/bridge";
import { toast } from "@/lib/sonner";
import type { Quote } from "@/features/extraction/types";
import { buildReceiptRows } from "@/features/app-home/components/format";
import { formatEtaWindow } from "@/features/journeys/format";
import { useAddToBag } from "@/features/bag/hooks/useAddToBag";
import { useCreateWatch } from "@/features/watches/hooks/useWatches";
import { cn } from "@/lib/utils";
import { ghs0, ghs2, storeLabel } from "../format";
import { compactCount } from "../shop-format";
import { Tap } from "./tap";
import { NavBar } from "./tap";
import { StoreTag } from "./bits";

type ViewQuote = Quote & { product_url: string; is_watching: boolean; rechecking: boolean };

/** Keep asking while the quote is still being priced or its freight is being checked. */
const busy = (q: ViewQuote | undefined) => !q || q.rechecking || q.freight_check != null || (!q.pricing && !q.pricing_unavailable_reason);

/** What the shop already knows about a listing: shown the instant it is tapped. */
export interface ProductSeed {
  title: string;
  image: string | null;
  store: string;
  totalGhs: number | null;
  rating: number | null;
  reviews: number | null;
  productUrl: string;
}

/**
 * A product, priced to the door: `GET /api/extractions/:id` (the website's quote call), add to bag,
 * and watch the price. The landed total and every breakdown row come from the server.
 *
 * Opened from the Shop it starts from the catalogue's `seed` (picture, title, its priced figure)
 * while `POST /api/products/extract` confirms today's price and stock with the store; the live
 * quote then takes over. No chat is started (Kelvin, 2026-11-24).
 */
export function ProductScreen({ id: givenId, seed }: { id: string | null; seed?: ProductSeed }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [id, setId] = useState<string | null>(givenId);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // From the shop: ask the store for today's price once, then hand over to the live quote.
  useEffect(() => {
    if (id || !seed) return;
    let alive = true;
    apiFetch<ApiSuccessResponse<Quote>>("/api/products/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_url: seed.productUrl }),
    }).then(
      ({ data }) => {
        if (!alive) return;
        if (!data.extraction_cache_id) {
          setConfirmError(data.pricing_unavailable_reason ?? "The store didn't give us a price just now.");
          return;
        }
        queryClient.setQueryData(["m-quote", data.extraction_cache_id, 1], { ...data, product_url: seed.productUrl, is_watching: false, rechecking: false });
        haptic("light");
        setId(data.extraction_cache_id);
      },
      (e: unknown) => alive && setConfirmError(e instanceof Error ? e.message : "We couldn't reach the store just now."),
    );
    return () => {
      alive = false;
    };
  }, [id, seed, queryClient]);
  const [qty, setQty] = useState(1);
  const add = useAddToBag();
  const watch = useCreateWatch();
  const [watching, setWatching] = useState<boolean | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const quote = useQuery({
    enabled: id != null,
    queryKey: ["m-quote", id, qty],
    queryFn: async () => (await apiFetch<ApiSuccessResponse<ViewQuote>>(`/api/extractions/${id}?quantity=${qty}`)).data,
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (busy(q.state.data) ? 2500 : false),
  });
  const q = quote.data;
  const p = q?.pricing ?? null;
  const isWatching = watching ?? q?.is_watching ?? false;
  const eta = p ? formatEtaWindow({ from: p.delivery_eta_from ?? null, to: p.delivery_eta_to ?? null, source: "estimated" }) : null;
  const canAdd = !!id && !!p && !q?.pay_hold && !add.isPending;
  const confirming = !id && !!seed && !confirmError;
  const image = q?.product.image ?? seed?.image ?? null;
  const title = q?.product.title ?? seed?.title ?? null;

  const flyToBag = () => {
    const from = imgRef.current?.getBoundingClientRect();
    if (!from || !q?.product.image) return;
    const f = document.createElement("img");
    f.src = q.product.image;
    f.className = "fly";
    const size = 110;
    Object.assign(f.style, { left: `${from.left + from.width / 2 - size / 2}px`, top: `${from.top + from.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px` });
    document.querySelector(".tm-m")?.appendChild(f);
    requestAnimationFrame(() => {
      f.style.transform = `translate(${window.innerWidth * 0.4}px, ${window.innerHeight - from.top - from.height / 2}px) scale(.15)`;
      f.style.opacity = "0.3";
    });
    setTimeout(() => f.remove(), 800);
  };

  return (
    <>
      <NavBar
        title={title ?? "Product"}
        back="Back"
        backHref={seed ? "/m/shop" : "/m"}
        actions={
          <button
            type="button"
            className="icon-btn"
            aria-label="Share"
            onClick={() => {
              haptic("light");
              const url = q?.product_url ?? seed?.productUrl;
              if (url) void share({ title: title ?? "Tomame", url });
            }}
          >
            <ShareNetwork size={18} />
          </button>
        }
      />

      <div className="hero-img up">
        {image ? (
          <img ref={imgRef} src={image} alt={title ?? ""} referrerPolicy="no-referrer" />
        ) : (
          <div className="shimmer" style={{ width: "70%", height: "70%" }} />
        )}
      </div>

      <div className="pd">
        <StoreTag store={q?.platform ?? seed?.store ?? null} country={q?.country === "USA" ? "USA" : q?.country === "UK" ? "UK" : q?.country ?? (seed ? "USA" : null)} />
        <h2>{title ?? <span className="shimmer" style={{ display: "block", height: 26, width: "80%" }} />}</h2>
        {seed?.rating != null && seed.rating > 0 && (
          <span className="sc-r" style={{ marginTop: 6 }}><Star size={13} weight="fill" />{seed.rating.toFixed(1)}{seed.reviews ? <small>({compactCount(seed.reviews)} reviews)</small> : null}</span>
        )}

        {confirming ? (
          <div className="confirming">
            <div className="big-price">
              {seed?.totalGhs != null ? <b className="nums">{ghs0(seed.totalGhs)}</b> : <span className="shimmer" style={{ width: 170, height: 40 }} />}
              <span>to your door<br />in Accra, all in</span>
            </div>
            <div className="confirm-bar"><span /></div>
            <p className="confirm-note">Confirming today&apos;s price and stock at {storeLabel(seed!.store)}…</p>
          </div>
        ) : confirmError && !id ? (
          <>
            {seed?.totalGhs != null && (
              <div className="big-price"><b className="nums">{ghs0(seed.totalGhs)}</b><span>last price we saw,<br />to your door</span></div>
            )}
            <p className="note" style={{ display: "flex", gap: 8 }}><WarningCircle size={18} weight="fill" style={{ flex: "none" }} />{confirmError}</p>
            <div style={{ marginTop: 12 }}><Tap href={`/m/price?url=${encodeURIComponent(seed!.productUrl)}`} className="btn btn-ghost btn-block">Ask Buy for me to price it</Tap></div>
          </>
        ) : p ? (
          <>
            <div className="big-price">
              <b className="nums">{ghs0(p.total_ghs)}</b>
              <span>to your door<br />in Accra, all in</span>
            </div>
            <div className="chips">
              {p.rate_locked_until && <span className="chip green"><LockSimple size={13} weight="bold" />Rate locked</span>}
              {p.weight_lbs != null && <span className="chip"><Scales size={13} weight="bold" />Freight · {p.weight_lbs} lb</span>}
            </div>
          </>
        ) : q?.pricing_unavailable_reason && !busy(q) ? (
          <p className="note" style={{ display: "flex", gap: 8 }}><WarningCircle size={18} weight="fill" style={{ flex: "none" }} />{q.pricing_unavailable_reason}</p>
        ) : (
          <div className="big-price"><span className="shimmer" style={{ width: 170, height: 40 }} /><span>{q?.freight_check ? "Checking the freight weight…" : "Pricing it to your door…"}</span></div>
        )}

        {q?.pay_hold && <p className="note">{q.pay_hold.message}</p>}

        {eta && (
          <div className="card eta">
            <span className="ic"><CalendarCheck size={22} weight="fill" /></span>
            <div><b>At your door {eta}</b><p>If you pay today. Customs is included.</p></div>
          </div>
        )}

        <div className="opt-h"><span>Quantity</span></div>
        <div className="stepper">
          <button type="button" aria-label="Fewer" disabled={qty <= 1} onClick={() => { haptic("select"); setQty((n) => Math.max(1, n - 1)); }}><Minus size={16} weight="bold" /></button>
          <span>{qty}</span>
          <button type="button" aria-label="More" disabled={qty >= 20} onClick={() => { haptic("select"); setQty((n) => Math.min(20, n + 1)); }}><Plus size={16} weight="bold" /></button>
        </div>

        {p && (
          <details className="card breakdown" open>
            <summary>How we got to {ghs0(p.total_ghs)}<CaretDown size={16} weight="bold" /></summary>
            {buildReceiptRows(p).map((r) => (
              <div key={r.key} className="brow"><span>{r.label}</span><b>{r.value}</b></div>
            ))}
            <div className="brow total"><span>To your door</span><b className="nums">{ghs2(p.total_ghs)}</b></div>
          </details>
        )}

        {q && (
          <button
            type="button"
            className="card watch-row"
            onClick={() => {
              if (isWatching) return;
              haptic("light");
              setWatching(true);
              watch.mutate(
                { url: q.product_url },
                {
                  onSuccess: () => toast.success({ title: "Watching it", description: "You'll hear the minute it drops." }),
                  onError: (e) => { setWatching(false); toast.error({ title: "Could not watch it", description: e.message }); },
                },
              );
            }}
          >
            <span className="ic"><BellSimpleRinging size={20} weight="fill" /></span>
            <span style={{ flex: 1, textAlign: "left" }}><b>Tell me when it drops</b><small>{isWatching ? "You're watching this price" : "WhatsApp and email, the minute it's cheaper"}</small></span>
            <span className={cn("toggle", isWatching && "on")} />
          </button>
        )}
        <div style={{ height: 110 }} />
      </div>

      <div className="foot-bar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canAdd}
          onClick={() => {
            if (!canAdd) return;
            haptic("medium");
            add.mutate(
              { extraction_cache_id: id!, quantity: qty },
              {
                onSuccess: () => {
                  flyToBag();
                  haptic("success");
                  toast.success({ title: "Added to your bag" });
                  setTimeout(() => router.push("/m/bag"), 650);
                },
                onError: (e) => {
                  haptic("error");
                  toast.error({ title: "Could not add it", description: e.message });
                },
              },
            );
          }}
        >
          <ShoppingBagOpen size={20} weight="bold" />
          {add.isPending ? "Adding…" : confirming ? "Confirming price…" : p ? `Add to bag · ${ghs0(p.total_ghs)}` : "Add to bag"}
        </button>
      </div>
    </>
  );
}
