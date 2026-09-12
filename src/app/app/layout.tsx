import { AppBottomTabs, AppNav } from "@/components/layout/app";
import { APP_NAV_ITEMS } from "@/components/layout/app/links";
import { getAppChrome } from "@/features/app-shell/services/app-chrome.service";

/**
 * The signed-in app shell — `design/TmNavLight.dc.html` plus the 390px bottom
 * tab bar from `id="v2-mobile"`.
 *
 * **No auth check here, deliberately.** `src/proxy.ts` already gates `/app` and
 * `/admin` (Next 16 renamed `middleware.ts` to `proxy.ts`, which is why a search
 * for the old filename suggests there is no gate). It also carves out
 * `/app/orders/new` and `/app/orders/review` as public, because the quote flow
 * is open to visitors per CLAUDE.md. A second redirect in this layout cannot see
 * those exceptions and would send signed-out visitors away from the quote flow —
 * verified: it did exactly that before this comment existed.
 *
 * So the shell renders for signed-out visitors on the public quote routes, and
 * `getAppChrome` degrades to a nameless, bell-less nav for them.
 */
export default async function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await getAppChrome();

  return (
    <div className="flex min-h-dvh flex-col bg-tm-paper font-sans text-tm-ink">
      <AppNav {...chrome} />

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pt-6 pb-16 md:px-8 md:pt-10">
        {children}
      </main>

      {/*
        Only for signed-in customers. Three of the four tabs point at routes
        `src/proxy.ts` gates, so showing the bar to a signed-out visitor on the
        public quote flow offers them navigation that can only bounce them to a
        login screen and discard the quote they were building.
      */}
      {chrome.isAuthenticated && <AppBottomTabs items={APP_NAV_ITEMS} />}
    </div>
  );
}
