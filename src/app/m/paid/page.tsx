import { redirect } from "next/navigation";

import { currentUser } from "@/features/mobile/services/session.service";
import { getJourneys, getPaidBagConfirmation } from "@/features/journeys/services/journeys.service";
import { Celebrate } from "@/features/mobile/components/celebrate";
import { Tap } from "@/features/mobile/components/tap";
import { Thumb } from "@/features/mobile/components/bits";
import { ghs2 } from "@/features/mobile/format";

/** After a settled payment: the confirmation, the promised date, and the way to the tracker. */
export default async function MobilePaidPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/m/welcome");
  const { group } = await searchParams;
  const [paid, journeys] = await Promise.all([getPaidBagConfirmation(user.id, group), getJourneys(user)]);
  const rows = group ? journeys.rows.filter((r) => r.orderGroupId === group) : [];
  const first = rows[0] ?? null;

  return (
    <>
      <Celebrate />
      <div className="check" aria-hidden>
        <svg viewBox="0 0 56 56" width="56" height="56"><path d="M14 29 l9 9 l19 -20" /></svg>
      </div>
      <h1 className="paid-h">Paid. We&apos;re on it.</h1>
      <p className="paid-sub">
        {paid ? <><b className="nums" style={{ color: "var(--m-ink)" }}>{ghs2(paid.valueGhs)}</b> for {paid.numItems} {paid.numItems === 1 ? "item" : "items"}<br /></> : null}
        We&apos;ve emailed your receipt.
      </p>

      <div className="card receipt up">
        <span className="eyebrow">{first ? `${first.orderNo}${rows.length > 1 ? ` + ${rows.length - 1} more` : ""}` : "Your order"}</span>
        <div className="eta-big">{paid?.promiseText ?? "We're buying it now"}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {rows.slice(0, 5).map((r) => <Thumb key={r.id} src={r.productImageUrl} />)}
        </div>
      </div>

      <div className="pad" style={{ display: "grid", gap: 10, marginTop: 22 }}>
        <Tap href={first ? `/m/orders/${first.id}` : "/m/orders"} className="btn btn-primary btn-block">Track my order</Tap>
        <Tap href="/m" className="btn btn-ghost btn-block">Keep shopping</Tap>
      </div>
    </>
  );
}
