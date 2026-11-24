import { redirect } from "next/navigation";
import { CheckCircle, CreditCard, Package } from "@phosphor-icons/react/ssr";

import { currentUser } from "@/features/mobile/services/session.service";
import { getJourneys } from "@/features/journeys/services/journeys.service";
import type { JourneyRow } from "@/features/journeys/types";
import { Tap } from "@/features/mobile/components/tap";
import { Thumb } from "@/features/mobile/components/bits";
import { PullToRefresh } from "@/features/mobile/components/gestures";
import { ghs2, shortDate } from "@/features/mobile/format";

type Tab = "active" | "done";

/** Orders: what is on its way (and what still needs paying), then what arrived. */
export default async function MobileOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/m/welcome?next=%2Fm%2Forders");
  const tab: Tab = (await searchParams).tab === "done" ? "done" : "active";
  const { rows } = await getJourneys(user);
  const done = rows.filter((r) => r.filter === "delivered" || r.status === "cancelled");
  const active = rows.filter((r) => !done.includes(r));
  const list = tab === "active" ? active : done;

  return (
    <>
      <PullToRefresh />
      <div className="lt"><div><h1>Orders</h1></div></div>
      <div className="segc" style={{ ["--i" as string]: tab === "active" ? 0 : 1, ["--n" as string]: 2 }}>
        <span className="knob" />
        <Tap href="/m/orders" replace scroll={false} haptic="select" className={tab === "active" ? "on" : ""} style={segBtn}>Active · {active.length}</Tap>
        <Tap href="/m/orders?tab=done" replace scroll={false} haptic="select" className={tab === "done" ? "on" : ""} style={segBtn}>Delivered · {done.length}</Tap>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <Package size={48} />
          <h3>{tab === "active" ? "Nothing on its way" : "Nothing delivered yet"}</h3>
          <p>{tab === "active" ? "Paste a link or ask Buy for me, and it's on its way in days." : "Delivered orders show here."}</p>
          {tab === "active" && <Tap href="/m/chat" className="btn btn-primary">Ask Buy for me</Tap>}
        </div>
      ) : (
        list.map((r) => <OrderCard key={r.id} row={r} />)
      )}
    </>
  );
}

const segBtn = { flex: 1, height: 34, borderRadius: 10, display: "grid", placeItems: "center", fontWeight: 650, fontSize: 14, position: "relative", zIndex: 1 } as const;

function OrderCard({ row }: { row: JourneyRow }) {
  const payable = row.isPayable;
  const delivered = row.filter === "delivered";
  const tone = payable ? "amber" : delivered ? "green" : "";
  return (
    <Tap href={payable ? "/m/bag" : `/m/orders/${row.id}`} className="card ocard up">
      <div className="top">
        <Thumb src={row.productImageUrl} />
        <span className="meta">
          <b>{row.productName}</b>
          <span className="sub">
            {row.orderNo} · Qty {row.quantity} · {shortDate(row.createdAt)}
          </span>
        </span>
      </div>
      <span className={`stage-tag ${tone}`}>
        {payable ? <CreditCard size={15} weight="fill" /> : delivered ? <CheckCircle size={15} weight="fill" /> : <Package size={15} weight="fill" />}
        {payable ? "Waiting for payment" : row.stageLabel}
      </span>
      {!delivered && !payable && (
        <div className="fill-bar" style={{ marginTop: 9, height: 6 }}><span style={{ width: `${Math.max(4, row.percent)}%` }} /></div>
      )}
      <div className="foot">
        <span>{payable ? "Tap to finish paying" : row.hint ?? ""}</span>
        {row.totalGhs != null && <b className="nums">{ghs2(row.totalGhs)}</b>}
      </div>
    </Tap>
  );
}
