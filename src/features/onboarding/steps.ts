/**
 * The four stops, in order. Kelvin's brief: "four stops, no more" — the
 * greeting rides along on stop one instead of getting a screen of its own.
 *
 * Each stop names the route its target lives on; the tour controller
 * navigates there first if the customer is somewhere else when the step
 * becomes current (stop 3 and 4 always require a hop, since a first-time
 * customer starts on Home).
 *
 * `targetId` is a real DOM id on a real element already on the page — see the
 * components it was added to: `hero-paste-bar.tsx`, `live-receipt-card.tsx`,
 * `bag-view.tsx` (`BagHeader`) and `journeys-view.tsx`.
 */
export interface OnboardingTourStep {
  id: "ask" | "price" | "bag" | "journey";
  route: string;
  targetId: string;
  title: string;
  body: string;
}

/**
 * `firstName` is folded into stop one's title so the greeting and the tour
 * are one thing, not two things stacked on top of each other.
 */
export function buildOnboardingTourSteps(firstName: string | null): OnboardingTourStep[] {
  const name = firstName?.trim();
  return [
    {
      id: "ask",
      route: "/app",
      targetId: "onboarding-tour-ask",
      title: name ? `Hi ${name}, welcome to Tomame` : "Welcome to Tomame",
      body: "We buy from stores in the US, the UK and China, then bring it home to Ghana. Paste a link here, or tell us what you want, and we will find it for you.",
    },
    {
      id: "price",
      route: "/app",
      targetId: "onboarding-tour-receipt",
      title: "See the whole price, in cedis",
      body: "Item, shipping, our fee and today's exchange rate, all folded into one number before you pay. No surprises when your parcel lands.",
    },
    {
      id: "bag",
      route: "/app/bag",
      targetId: "onboarding-tour-bag",
      title: "Everything you buy lives here",
      body: "Add a few things and we group them into one box, so you pay once and save on shipping.",
    },
    {
      id: "journey",
      route: "/app/orders",
      targetId: "onboarding-tour-journeys",
      title: "Watch it travel home",
      body: "Once you pay, every parcel shows up here, from the store to our hub to your door.",
    },
  ];
}
