import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { AccountRail } from "@/features/account/components/account-rail";
import { AccountAddressesPanel } from "@/features/account/components/account-addresses-panel";
import { AccountNotificationsPanel } from "@/features/account/components/account-notifications-panel";
import { AccountPaymentPanel } from "@/features/account/components/account-payment-panel";
import { AccountProfilePanel } from "@/features/account/components/account-profile-panel";
import { AccountSecurityPanel } from "@/features/account/components/account-security-panel";
import { AccountWatchPanel } from "@/features/account/components/account-watch-panel";
import {
  getAccountProfile,
  resolveNotificationChannels,
} from "@/features/account/services/account-profile.service";
import { accountTab, resolveAccountTab } from "@/features/account/tabs";
import { listAddresses } from "@/features/addresses/services/addresses.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listUserNotifications } from "@/features/notifications/services/notifications.service";
import { getBagPaymentSettings } from "@/features/payments/services/payment-channels.service";
import { listUserTransactions } from "@/features/payments/services/payments.service";
import { listWatches } from "@/features/watches/services/watches.service";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account · Tomame",
  description:
    "Your profile, delivery addresses, payments, price watches, notifications and password.",
};

/**
 * `/app/account` — the account screen.
 *
 * Not drawn in the two v2 artboards (the data map says so), so it follows the
 * established v2 patterns instead of a mock: 24px cards on `bg-card`, `tm-up`
 * with explicit durations and delays, the same type scale as `/app/bag` and
 * `/app/watches`.
 *
 * **A server component, one tab at a time.** The tab lives in `?tab=`, so this
 * render loads only the sources the visible panel needs — six tabs, six
 * different reads, never all six at once. The alternative (one client island
 * holding every panel) would fetch a customer's whole account on every visit to
 * change a name.
 *
 * Every panel is fed from a table or a live service. Nothing on this screen is a
 * placeholder: where an account genuinely has nothing — no addresses, no
 * payments, no watches, no notifications — the panel says so rather than
 * showing a sample row.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, params] = await Promise.all([getAuthenticatedUser(), searchParams]);
  // `src/proxy.ts` already gates `/app`; this covers the session that vanished
  // between that check and this render.
  if (!user) redirect("/auth/login?next=/app/account");

  const tab = resolveAccountTab(params.tab);
  const { blurb } = accountTab(tab);

  return (
    <div className="flex flex-col gap-7">
      <header className="tm-up flex flex-col gap-2 [animation-duration:0.5s]">
        <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[42px]">
          Account
        </h1>
        <p className="max-w-[58ch] text-[15px] leading-[1.5] font-medium text-tm-text-2">
          Everything about you that Tomame holds — and everything you can change
          about it.
        </p>
      </header>

      {/*
        `minmax(0,1fr)` on the phone column too. A bare implicit `1fr` is
        `minmax(auto,1fr)`, whose floor is the content's min-width — and the
        rail's pill row is wider than any phone, so the column grew past the
        viewport and the whole account page scrolled sideways.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-7">
        <AccountRail active={tab} />
        {/*
          `key` on the panel wrapper restarts the entrance animation on every tab
          change. Without it React reuses the subtree across navigations and the
          new panel appears with no transition at all, which reads as a glitch
          next to the rail's own movement.
        */}
        <div key={tab} className="min-w-0">
          <AccountTabPanel tab={tab} blurb={blurb} user={user} />
        </div>
      </div>
    </div>
  );
}

/**
 * Loads and renders exactly one tab.
 *
 * Split out so each branch can `await` only its own sources — a switch inside
 * the page body would have to hoist every read above it.
 */
async function AccountTabPanel({
  tab,
  blurb,
  user,
}: {
  tab: ReturnType<typeof resolveAccountTab>;
  blurb: string;
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
}) {
  switch (tab) {
    case "addresses": {
      const [addresses, zones] = await Promise.all([
        listAddresses(user.id),
        listActiveDeliveryZones(),
      ]);
      return <AccountAddressesPanel addresses={addresses} zones={zones} blurb={blurb} />;
    }

    case "payment": {
      const client = await createClient();
      const [history, payment] = await Promise.all([
        listUserTransactions(client, user),
        // Channels and the hold note come from one `site_settings` read.
        getBagPaymentSettings(),
      ]);
      return (
        <AccountPaymentPanel
          transactions={history.transactions}
          channels={payment.channels}
          holdNote={payment.holdNote}
          blurb={blurb}
        />
      );
    }

    case "watch": {
      const watches = await listWatches(user.id);
      // One instant for every "checked N hrs ago" on this render.
      return <AccountWatchPanel watches={watches} blurb={blurb} now={new Date()} />;
    }

    case "notifications": {
      const [profile, list] = await Promise.all([
        getAccountProfile(user.id, user.email ?? null),
        listUserNotifications(user),
      ]);
      const channels = resolveNotificationChannels(profile);
      return (
        <AccountNotificationsPanel
          notifications={list.notifications}
          unreadCount={list.unread_count}
          preferences={{
            notify_email: profile.notify_email,
            // What the row says, corrected for reality: the opt-in can outlive
            // the phone number it was given for, and a switch showing "on" with
            // nowhere to send would be describing a message nobody receives.
            whatsapp_opt_in: channels.whatsapp,
          }}
          hasPhone={(profile.phone ?? "").trim() !== ""}
          blurb={blurb}
        />
      );
    }

    case "security":
      return (
        <AccountSecurityPanel
          blurb={blurb}
          lastSignInAt={user.last_sign_in_at ?? null}
          createdAt={user.created_at ?? null}
        />
      );

    case "profile":
    default: {
      const profile = await getAccountProfile(user.id, user.email ?? null);
      return <AccountProfilePanel profile={profile} blurb={blurb} />;
    }
  }
}
