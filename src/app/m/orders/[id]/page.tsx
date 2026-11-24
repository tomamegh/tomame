import { notFound, redirect } from "next/navigation";
import { CalendarCheck, CaretRight, Check, LockSimple, MapTrifold, Motorcycle, Phone, Sparkle } from "@phosphor-icons/react/ssr";

import { currentUser } from "@/features/mobile/services/session.service";
import { getJourneyDetail } from "@/features/journeys/services/journey-detail.service";
import { getCourierForViewer } from "@/features/order-delivery/services/courier.service";
import { describePlan } from "@/features/journeys/delivery-plan";
import { formatEtaWindow } from "@/features/journeys/format";
import type { JourneyTrack } from "@/features/orders/services/journey-track";
import { APIError } from "@/lib/auth/api-helpers";
import { NavBar, Tap } from "@/features/mobile/components/tap";
import { currentStop, StopIcon } from "@/features/mobile/components/bits";
import { CopyValue, DeliveryCode, PullToRefresh } from "@/features/mobile/components/gestures";
import { ago, shortDate } from "@/features/mobile/format";

/** The live tracker: where the parcel is on the JFK → ACC route, the six stops, the code at the door. */
export default async function MobileOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect(`/m/welcome?next=${encodeURIComponent(`/m/orders/${id}`)}`);

  let journey, courier;
  try {
    [journey, courier] = await Promise.all([getJourneyDetail(user, id), getCourierForViewer(user.id, id)]);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }

  const { track } = journey;
  const now = currentStop(track);
  const plan = journey.plan ? describePlan(journey.plan) : null;
  const eta = formatEtaWindow(journey.eta);
  const headline = track.isCancelled ? "Cancelled" : track.isComplete ? "Delivered" : journey.stageLabel;
  const sub = track.isCancelled ? (track.cancellation?.reason ?? "This order was cancelled.") : (plan?.line ?? journey.note ?? "");
  const hubPhotos = journey.photos.slice(0, 6);

  return (
    <>
      <NavBar title={journey.orderNo} back="Orders" backHref="/m/orders" />
      <PullToRefresh />

      <div className="route up">
        <RouteMap track={track} />
        <span className="lbl" style={{ left: 18, top: 116 }}>JFK<b>US hub</b></span>
        <span className="lbl" style={{ right: 18, top: 116, textAlign: "right" }}>ACC<b>Accra</b></span>
        <div className="inner">
          <span className="eyebrow" style={{ color: "#ffb39f" }}>Now · {track.stops.find((s) => s.key === now)?.label}</span>
          <h2>{headline}</h2>
          {sub && <p>{sub}</p>}
          {eta && !track.isCancelled && (
            <span className="eta-pill">
              <CalendarCheck size={16} weight="fill" />
              {track.isComplete ? "Delivered" : `At your door ${eta}`}
            </span>
          )}
        </div>
      </div>

      <div className="track-meta">
        <CopyValue label="Tracking number" value={journey.orderNo} />
        <div className="card"><small>Deliver to</small><b>{journey.deliverTo?.label ?? "—"}</b></div>
      </div>

      {journey.deliveryCode ? (
        <DeliveryCode code={journey.deliveryCode} rider={courier?.name ?? null} />
      ) : !track.isComplete && !track.isCancelled ? (
        <div className="card code-card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="thumb" style={{ width: 42, height: 42 }}><LockSimple size={20} weight="fill" /></span>
          <span><b style={{ display: "block" }}>Delivery code</b><small className="muted">Shows here when your rider sets off. Hold to see it.</small></span>
        </div>
      ) : null}

      {courier && !track.isComplete && (
        <div className="card addr" style={{ width: "auto" }}>
          <span className="ic"><Motorcycle size={21} weight="fill" /></span>
          <span className="meta"><b>{courier.name ?? "Your rider"}</b><small>On the way with your parcel</small></span>
          {courier.trackingUrl && (
            <a className="icon-btn" href={courier.trackingUrl} target="_blank" rel="noreferrer" aria-label="Live map"><MapTrifold size={18} /></a>
          )}
          {courier.phone && (
            <a className="icon-btn" href={`tel:${courier.phone}`} aria-label={`Call ${courier.name ?? "the rider"}`}><Phone size={18} weight="fill" /></a>
          )}
        </div>
      )}

      <div className="card rail up">
        {track.stops.map((s) => (
          <div key={s.key} className={`stop ${s.state}`}>
            <span className="dot">{s.state === "done" ? <Check size={17} weight="bold" /> : <StopIcon stop={s.key} size={17} />}</span>
            <div className="meta">
              <b>{s.label}</b>
              <small>{s.at ? shortDate(s.at) : s.state === "up" ? "—" : ""}{s.note ? ` · ${s.note}` : ""}</small>
              {s.key === "hub" && s.state !== "up" && hubPhotos.length > 0 && (
                <div className="photos">
                  {hubPhotos.map((p) => (
                    <img key={p.id} src={p.url} alt={p.caption ?? "At our US hub"} loading="lazy" />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {journey.updates.length > 0 && (
        <>
          <div className="section-h"><h2>Updates</h2></div>
          <div className="card updates">
            {journey.updates.slice(0, 8).map((u) => (
              <div key={u.id} className="upd">
                <b>{u.title}</b>
                {u.detail && <p>{u.detail}</p>}
                <small>{ago(u.occurred_at)}{u.location ? ` · ${u.location}` : ""}</small>
              </div>
            ))}
          </div>
        </>
      )}

      <Tap href="/m/chat" className="card ask-order">
        <span className="ai-av"><Sparkle size={17} weight="fill" /></span>
        <span style={{ flex: 1 }}><b style={{ display: "block" }}>Ask about this order</b><small className="muted">Buy for me can help</small></span>
        <CaretRight size={18} color="var(--m-text-3)" />
      </Tap>
    </>
  );
}

/** The JFK → ACC arc with the plane where the parcel is: at the hub, mid-flight, or landed. */
function RouteMap({ track }: { track: JourneyTrack }) {
  const now = currentStop(track);
  const air = track.stops.find((s) => s.key === "in_the_air");
  const t = track.isComplete || now === "in_accra" || now === "your_door" ? 0.97 : air?.state === "now" ? 0.56 : air?.state === "done" ? 0.97 : 0.04;
  const P0 = [40, 112], P1 = [179, -6], P2 = [318, 112];
  const at = (i: 0 | 1, u: number) => (1 - u) ** 2 * P0[i]! + 2 * (1 - u) * u * P1[i]! + u * u * P2[i]!;
  const dx = 2 * (1 - t) * (P1[0]! - P0[0]!) + 2 * t * (P2[0]! - P1[0]!);
  const dy = 2 * (1 - t) * (P1[1]! - P0[1]!) + 2 * t * (P2[1]! - P1[1]!);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return (
    <svg className="map" viewBox="0 0 358 150" aria-hidden>
      <defs>
        <linearGradient id="m-route" x1="0" x2="1">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset=".6" stopColor="#f97316" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M40 112 Q179 -6 318 112" stroke="#ffffff38" strokeWidth="2" strokeDasharray="3 6" fill="none" />
      <path d="M40 112 Q179 -6 318 112" stroke="url(#m-route)" strokeWidth="3" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray={`${t * 100} 100`} />
      <circle cx="40" cy="112" r="6" fill="#f43f5e" />
      <circle cx="40" cy="112" r="11" fill="#f43f5e" opacity=".25" />
      <circle cx="318" cy="112" r="6" fill={t > 0.9 ? "#f59e0b" : "#ffffff55"} />
      <g transform={`translate(${at(0, t).toFixed(1)} ${at(1, t).toFixed(1)}) rotate(${ang.toFixed(1)})`}>
        <circle r="15" fill="#fff" opacity=".14" />
        <path d="M0,-11 L2,-3.5 L10,1.5 L10,4 L2,1.8 L1.4,7 L4,9.2 L4,11 L0,10 L-4,11 L-4,9.2 L-1.4,7 L-2,1.8 L-10,4 L-10,1.5 L-2,-3.5 Z" fill="#fff" />
      </g>
    </svg>
  );
}
