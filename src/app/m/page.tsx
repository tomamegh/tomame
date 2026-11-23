import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CaretRight, Check, Package } from "@phosphor-icons/react/ssr";

import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { getHomeView } from "@/features/app-home/services/home.service";
import { getDisplayFxRateQuote } from "@/features/pricing/services/fx-rate.service";
import { formatEtaWindow } from "@/features/journeys/format";
import { HomeAsk } from "@/features/mobile/components/home-ask";
import { Tap } from "@/features/mobile/components/tap";
import { currentStop, StopIcon, StoreTag, Thumb, TrackDots } from "@/features/mobile/components/bits";
import { ghs0, greetingFor, pctLabel } from "@/features/mobile/format";

/** Home: ask for something, then what is moving, what is priced, the box and what dropped. */
export default async function MobileHomePage() {
  const [view, rate] = await Promise.all([
    getHomeView(readQuoteSessionFromCookies(await cookies())),
    getDisplayFxRateQuote().catch(() => null),
  ]);
  if (!view) redirect("/m/welcome");

  const { greeting, orders, deals, freightBox, watches, rateLockHours } = view;
  const moving = orders.find((o) => !o.track.isComplete && !o.track.isCancelled) ?? null;
  const priced = (deals?.products ?? []).filter((p) => p.total_ghs != null && !p.unpriceable).slice(0, 10);
  const drops = watches.watches.filter((w) => w.stats.direction === "drop" && w.stats.current_total_ghs != null).slice(0, 3);
  const initial = greeting.firstName?.trim().charAt(0).toUpperCase() || "T";
  const trust = ["Price in GH₵ before you pay", "Refund if we can't source", ...(rateLockHours ? [`Rate locked ${rateLockHours}h`] : [])];

  return (
    <>
      <header className="home-top up">
        <span className="brand">
          <img className="mark" src="/images/brand/logo-mark.webp" alt="" />
          <img className="word" src="/images/brand/logo-wordmark.webp" alt="Tomame" />
        </span>
        {rate?.applied_rate ? (
          <span className="rate-pill nums">
            <span className="live-dot" />$1 = GH₵{rate.applied_rate.toFixed(2)}
          </span>
        ) : null}
        <Tap href="/m/account" className="avatar" aria-label="Account">{initial}</Tap>
      </header>

      <h1 className="hello up">
        {greetingFor(greeting.timeOfDay)}
        {greeting.firstName ? `, ${greeting.firstName}` : ""}.
        <br />
        <span>What are we <em>buying</em> today?</span>
      </h1>

      <HomeAsk />

      <div className="trust up">
        {trust.map((t) => (
          <span key={t} className="chip"><Check size={14} weight="bold" />{t}</span>
        ))}
      </div>

      {moving && (
        <Tap href={`/m/orders/${moving.id}`} className="card live-order up">
          <Thumb src={moving.productImageUrl} />
          <span className="meta">
            <span className="eyebrow coral"><StopIcon stop={currentStop(moving.track)} size={12} /> {moving.stageLabel} · {moving.orderNo}</span>
            <b>{formatEtaWindow(moving.eta) ? `At your door ${formatEtaWindow(moving.eta)}` : moving.productName}</b>
            <TrackDots track={moving.track} />
          </span>
          <CaretRight size={18} color="var(--m-text-3)" />
        </Tap>
      )}

      {priced.length > 0 && (
        <>
          <div className="section-h"><h2>Landed in Accra</h2><Tap href="/m/chat" className="link">Ask for more</Tap></div>
          <div className="shelf">
            {priced.map((p) => (
              <Tap key={p.id} href={`/m/price?url=${encodeURIComponent(p.product_url)}`} className="pcard">
                <div className="img">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <StoreTag store={p.store} />
                <div className="t">{p.title}</div>
                <div className="p nums">{ghs0(p.total_ghs!)}<small>all in</small></div>
              </Tap>
            ))}
          </div>
        </>
      )}

      {freightBox && (
        <>
          <div className="section-h"><h2>Your box to Accra</h2><Tap href="/m/bag" className="link">Open bag</Tap></div>
          <Tap href="/m/bag" className="card box-card">
            <div className="row">
              <span className="ic"><Package size={24} weight="fill" /></span>
              <div>
                <b>{freightBox.itemCount} {freightBox.itemCount === 1 ? "item" : "items"}, one flight</b>
                <p>
                  {freightBox.marginalSavingGhs > 0
                    ? `Add more and save about ${ghs0(freightBox.marginalSavingGhs)} on freight.`
                    : "Add more before it closes and they share the freight."}
                </p>
              </div>
            </div>
            <div className="fill-bar"><span style={{ width: `${Math.max(4, Math.min(100, freightBox.fillPct))}%` }} /></div>
          </Tap>
        </>
      )}

      {drops.length > 0 && (
        <>
          <div className="section-h"><h2>Dropped since you looked</h2><Tap href="/m/watch" className="link">Price watch</Tap></div>
          <div className="card drops">
            {drops.map(({ watch, stats }) => (
              <Tap key={watch.id} href={`/m/price?url=${encodeURIComponent(watch.product_url)}`} className="drop-row">
                <Thumb src={watch.product_image_url} />
                <span className="meta"><b>{watch.product_name ?? "Watched item"}</b><small>{stats.delta_label ?? stats.status_label}</small></span>
                <span className="now">
                  <b className="nums">{ghs0(stats.current_total_ghs!)}</b>
                  <br />
                  {stats.delta_pct != null && <span className="pct">{pctLabel(stats.delta_pct)}</span>}
                </span>
              </Tap>
            ))}
          </div>
        </>
      )}

      {!moving && priced.length === 0 && !freightBox && (
        <p className="fine" style={{ marginTop: 28 }}>Paste a link from Amazon, eBay, Walmart, SHEIN and more — or just say what you want.</p>
      )}
    </>
  );
}
