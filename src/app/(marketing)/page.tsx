import type { Metadata } from "next";

import {
  ClosingCta,
  FaqSection,
  LandingHero,
  ProcessSection,
  ProofSection,
  RegionsStrip,
  ValueSection,
  transitWindow,
} from "@/components/marketing/landing";
import { whatsappHref } from "@/components/layout/marketing";
import type { RegionRow } from "@/db/queries/regions";
import { listRegions } from "@/db/queries/regions";
import {
  getFeatureDemos,
  getFeesWorkedExample,
  getLandingContent,
  getMarketingSettings,
  resolveMarketingFigures,
} from "@/features/marketing/services";
import { DEFAULT_FX_BUFFER_PCT } from "@/config/pricing";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { getMediaOverrides } from "@/db/queries/media-overrides";
import { isAuthenticated } from "@/lib/supabase/current-user";

export const metadata: Metadata = {
  title: "Tomame: Shop the world. Pay in cedis.",
  description:
    "Paste a link from any US store and see the full price at your door before you pay: item, tax, fee, freight. Mobile Money or card, delivered in Ghana.",
};

/**
 * Marketing content changes only when an admin edits it, so the data is cached
 * for four hours. The route still renders per request while the nav resolves
 * the session in the layout.
 */
export const revalidate = 14400;

/** "the USA" / "the UK" / "China" — how the copy refers to a lane. */
function originLabel(region: RegionRow): string {
  switch (region.code) {
    case "USA":
      return "the USA";
    case "UK":
      return "the UK";
    default:
      return region.name;
  }
}

/** "the UK and China" → "The UK and China", for a sentence-initial list. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "the UK and China" from the codes actually in the table. */
function joinLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export default async function HomePage() {
  const [
    content,
    regions,
    figures,
    example,
    settings,
    midMarketRate,
    authed,
    mediaOverrides,
  ] =
    await Promise.all([
      getLandingContent(),
      listRegions(),
      resolveMarketingFigures(),
      getFeesWorkedExample(),
      getMarketingSettings(),
      getGhsRate("USD"),
      isAuthenticated(),
      getMediaOverrides(),
    ]);

  // Depends on the seeded card rows, so it runs after the content query.
  const demos = await getFeatureDemos(content.featureCards);

  const liveRegions = regions.filter((region) => region.status === "live");
  const soonRegions = regions.filter((region) => region.status === "soon");
  const primary = liveRegions[0] ?? regions[0] ?? null;

  // The pill quotes the rate the receipt beside it was priced at, so the two
  // can never disagree. The mid-market read is only a fallback.
  const usdToGhs =
    example.breakdown.exchange_rate > 0
      ? example.breakdown.exchange_rate
      : midMarketRate
        ? midMarketRate * (1 + DEFAULT_FX_BUFFER_PCT)
        : 0;

  const liveLabels = liveRegions.map(originLabel);
  const soonLabels = soonRegions.map(originLabel);

  return (
    <>
      <LandingHero
        usdToGhs={usdToGhs}
        originLabel={primary ? originLabel(primary) : "the USA"}
        cyclerStores={primary?.store_names ?? []}
        trustChips={content.trustChips}
        example={example}
        transitLabel={primary ? transitWindow(primary) : null}
        mediaOverrides={mediaOverrides}
      />

      <ProcessSection steps={content.processSteps} />

      <ValueSection
        featureCards={content.featureCards}
        example={example}
        demos={demos}
        mediaOverrides={mediaOverrides}
      />

      <RegionsStrip
        mediaOverrides={mediaOverrides}
        regions={regions}
        freightLabel={`from ${figures.freight_rate_per_lb.display}`}
        headline={
          soonLabels.length > 0
            ? `From ${joinLabels(liveLabels)} today. ${sentenceCase(joinLabels(soonLabels))} next.`
            : `From ${joinLabels(liveLabels)}, today.`
        }
        blurb={
          soonLabels.length > 0
            ? `Our buyers purchase from any store in ${joinLabels(liveLabels)} right now. ${sentenceCase(joinLabels(soonLabels))} lanes are being set up. Join the waitlist and we'll tell you the day they open.`
            : `Our buyers purchase from any store in ${joinLabels(liveLabels)} right now.`
        }
      />

      <ProofSection stats={content.stats} testimonials={content.testimonials} />

      <FaqSection
        faqs={content.faqs}
        whatsappHref={whatsappHref(settings.whatsappNumber)}
        supportHours={settings.supportHours}
      />

      <ClosingCta isAuthenticated={authed}
        mediaOverrides={mediaOverrides} />
    </>
  );
}
