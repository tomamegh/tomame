import { redirect } from "next/navigation";
import { BellRinging, TrendDown, TrendUp } from "@phosphor-icons/react/ssr";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listWatches } from "@/features/watches/services/watches.service";
import type { WatchListItem } from "@/features/watches/types";
import { Tap } from "@/features/mobile/components/tap";
import { Spark, Thumb } from "@/features/mobile/components/bits";
import { PullToRefresh } from "@/features/mobile/components/gestures";
import { AddWatch, StopWatching } from "@/features/mobile/components/watch-actions";
import { ago, ghs0 } from "@/features/mobile/format";

/** Price watch: drops first, then everything being watched. The cron re-reads prices; this reads its results. */
export default async function MobileWatchPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/m/welcome?next=%2Fm%2Fwatch");
  const { watches } = await listWatches(user.id);
  const drops = watches.filter((w) => w.stats.direction === "drop");
  const rest = watches.filter((w) => w.stats.direction !== "drop");

  return (
    <>
      <PullToRefresh />
      <div className="lt"><div><h1>Price watch</h1><p>We check every few hours. You hear first.</p></div></div>
      <AddWatch />

      {watches.length === 0 && (
        <div className="empty">
          <BellRinging size={48} />
          <h3>Nothing watched yet</h3>
          <p>Paste a link above, or swipe right on anything in your bag, and we&apos;ll tell you when it drops.</p>
        </div>
      )}

      {drops.map((w) => <WatchCard key={w.watch.id} item={w} fresh />)}
      {rest.length > 0 && drops.length > 0 && <div className="section-h" style={{ marginTop: 18 }}><h2>Watching</h2></div>}
      {rest.map((w) => <WatchCard key={w.watch.id} item={w} />)}
    </>
  );
}

function WatchCard({ item: { watch, stats }, fresh = false }: { item: WatchListItem; fresh?: boolean }) {
  const now = stats.current_total_ghs ?? watch.last_total_ghs;
  const was = stats.delta_ghs != null && now != null ? now - stats.delta_ghs : null;
  const kind = stats.direction === "drop" ? { cls: "g", label: "Price drop", Icon: TrendDown } : stats.direction === "rise" ? { cls: "c", label: "Went up", Icon: TrendUp } : { cls: "n", label: "Watching", Icon: BellRinging };
  return (
    <div className={`card alert up${fresh ? " fresh" : ""}`}>
      <div className={`kind ${kind.cls}`}>
        <kind.Icon size={14} weight="fill" />
        {kind.label}
        <span className="when">{watch.last_checked_at ? `Checked ${ago(watch.last_checked_at).toLowerCase()}` : "First check soon"}</span>
      </div>
      <div className="row">
        <Thumb src={watch.product_image_url} />
        <div className="meta">
          <b>{watch.product_name ?? "Watched item"}</b>
          <div className="np nums">
            {now != null ? ghs0(now) : "—"}
            {was != null && stats.direction === "drop" && <s>{ghs0(was)}</s>}
          </div>
          <small className="muted">{stats.delta_label ?? stats.status_label}</small>
        </div>
        {stats.sparkline && <Spark bars={stats.sparkline.bars} direction={stats.sparkline.direction} />}
      </div>
      <div className="acts">
        <StopWatching id={watch.id} />
        <Tap href={`/m/price?url=${encodeURIComponent(watch.product_url)}`} className="btn btn-primary" haptic="medium">Price it now</Tap>
      </div>
    </div>
  );
}
