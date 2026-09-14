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
 * `bag-view.tsx` (`BagHeader`) and `journeys-view.tsx`. Every one of those
 * renders unconditionally, including its empty state, so a first-time customer
 * with no receipt, no bag and no parcels still has all four targets to point
 * at. Each stop's copy is therefore written to be true of an EMPTY screen, not
 * of a populated one.
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
      // WRITTEN FOR AN EMPTY CARD FIRST. The receipt shows the last link the
      // customer pasted, and a first-time customer has pasted nothing, so it
      // renders its empty state. The old copy said "See the whole price" while
      // pointing at a card with no price in it, which teaches nobody anything.
      // Prefilling it with a sample was never an option: CLAUDE.md forbids
      // showing invented data, and a made-up price is the worst thing to invent
      // on a screen whose whole promise is that the number is real. So the copy
      // says where the number will land, which is true whether the card is
      // empty or full.
      title: "The whole price lands here, in cedis",
      body: "Paste a link and the item, shipping, our fee and today's exchange rate arrive as one number. That is what you pay, with nothing added when your parcel reaches you.",
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
