import { redirect } from "next/navigation";
import { BellSimpleRinging, CaretRight, ChatCircleDots, HouseLine, Receipt, ShieldCheck, Wallet } from "@phosphor-icons/react/ssr";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { getJourneys } from "@/features/journeys/services/journeys.service";
import { listWatches } from "@/features/watches/services/watches.service";
import { listAddresses } from "@/features/addresses/services/addresses.service";
import { NavBar, Tap } from "@/features/mobile/components/tap";
import { HapticsControls, SignOutCell } from "@/features/mobile/components/account-controls";

/** Account. Profile and counts from the same services as the website; detailed settings open its pages. */
export default async function MobileAccountPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/m/welcome?next=%2Fm%2Faccount");
  const [journeys, watches, addresses] = await Promise.all([getJourneys(user), listWatches(user.id), listAddresses(user.id)]);
  const name = [user.profile.first_name, user.profile.last_name].filter(Boolean).join(" ") || user.email || "Your account";
  const initial = (user.profile.first_name ?? user.email ?? "T").charAt(0).toUpperCase();

  return (
    <>
      <NavBar title="" back="Home" backHref="/m" />
      <div className="lt" style={{ paddingTop: 4 }}><h1>Account</h1></div>
      <div className="card profile up">
        <span className="avatar">{initial}</span>
        <div style={{ minWidth: 0 }}>
          <b>{name}</b>
          <small>{user.profile.phone ?? user.email}</small>
        </div>
      </div>
      <div className="stats up">
        <Tap href="/m/orders" className="card"><b>{journeys.count}</b><small>Orders</small></Tap>
        <Tap href="/m/watch" className="card"><b>{watches.watching_count}</b><small>Watching</small></Tap>
        <div className="card"><b>{addresses.length}</b><small>Addresses</small></div>
      </div>

      <div className="group-h">Delivery &amp; pay</div>
      <div className="card group">
        <Cell href="/app/account?tab=addresses" bg="var(--m-coral)" icon={<HouseLine size={17} weight="fill" />} label="Addresses" value={String(addresses.length)} />
        <Cell href="/app/account?tab=payment" bg="#e8b800" icon={<Wallet size={17} weight="fill" />} label="Payments & MoMo" />
        <Cell href="/app/transactions" bg="#6e625b" icon={<Receipt size={17} weight="fill" />} label="Receipts" />
      </div>

      <div className="group-h">Feel &amp; alerts</div>
      <div className="card group">
        <HapticsControls />
        <Cell href="/app/account?tab=notifications" bg="var(--m-coral-strong)" icon={<BellSimpleRinging size={17} weight="fill" />} label="Notifications" />
      </div>

      <div className="group-h">Help</div>
      <div className="card group">
        <Cell href="/m/chat" bg="var(--m-coral)" icon={<ChatCircleDots size={17} weight="fill" />} label="Ask Buy for me" />
        <Cell href="/app/account?tab=security" bg="#2b2422" icon={<ShieldCheck size={17} weight="fill" />} label="Security" />
        <SignOutCell />
      </div>
      <p className="fine" style={{ marginTop: 22 }}>Tomame for iPhone</p>
    </>
  );
}

function Cell({ href, bg, icon, label, value }: { href: string; bg: string; icon: React.ReactNode; label: string; value?: string }) {
  return (
    <Tap href={href} className="cell">
      <span className="ci" style={{ background: bg }}>{icon}</span>
      {label}
      <span className="val">{value}<CaretRight size={14} /></span>
    </Tap>
  );
}
