import { AppBottomTabs, AppNav } from "@/components/layout/app";
import { APP_BOTTOM_TABS_PADDING } from "@/components/layout/app/styles";
import { APP_NAV_ITEMS } from "@/components/layout/app/links";
import { cn } from "@/lib/utils";
import { getAppChrome } from "@/features/app-shell/services/app-chrome.service";
import { getOnboardingSignals } from "@/features/onboarding/services/onboarding-state.service";
import { OnboardingTour } from "@/features/onboarding/components";

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
  // Independent of the chrome read above (a separate concern: whose tour has
  // this customer seen, not what the nav shows), run in parallel with it.
  const [chrome, onboarding] = await Promise.all([getAppChrome(), getOnboardingSignals()]);

  return (
    <div className="flex min-h-dvh flex-col bg-tm-paper font-sans text-tm-ink">
      <AppNav {...chrome} />

      {/*
        `overflow-x-clip`: the body must never scroll sideways on a phone. Every
        wide thing (a table, the account rail's pill row) scrolls inside its own
        box; this is the guarantee that a stray min-content width somewhere
        cannot widen the whole page again — which is exactly what the account
        screen did until its grid column got a zero floor.
      */}
      <main
        className={cn(
          "mx-auto w-full max-w-[1280px] flex-1 overflow-x-clip px-5 pt-6 md:px-8 md:pt-10",
          // Signed-in phones have the fixed tab bar to clear; everyone else gets
          // the ordinary bottom rhythm. Routes that pin their own bar reserve
          // their own space (`BagView` pads for `BagPayBar`).
          chrome.isAuthenticated ? APP_BOTTOM_TABS_PADDING : "pb-16",
        )}
      >
        {children}
      </main>

      {/*
        Only for signed-in customers. Three of the four tabs point at routes
        `src/proxy.ts` gates, so showing the bar to a signed-out visitor on the
        public quote flow offers them navigation that can only bounce them to a
        login screen and discard the quote they were building.
      */}
      {chrome.isAuthenticated && <AppBottomTabs items={APP_NAV_ITEMS} />}

      {/*
        The first-run tour. Mounted only for a signed-in viewer — a signed-out
        visitor on the public quote routes has no profile row for it to check
        and must never see it. `OnboardingTour` decides FOR ITSELF whether to
        actually start (see `shouldShowOnboardingTour`); mounting it here just
        makes the signals available on every /app render.
      */}
      {chrome.isAuthenticated && <OnboardingTour signals={onboarding} />}
    </div>
  );
}
