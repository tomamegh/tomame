import type { Metadata } from "next";

import { SECTIONS } from "@/features/warehouse/guide/content";
import { ConsolidatedGuide } from "@/features/warehouse/guide/components/consolidated-guide";
import { FaqList, GlossaryList } from "@/features/warehouse/guide/components/faq-glossary";
import { FlowDiagram } from "@/features/warehouse/guide/components/flow-diagram";
import { ContentsBar, ContentsRail, GuideSpy } from "@/features/warehouse/guide/components/guide-contents";
import { GuideHero } from "@/features/warehouse/guide/components/guide-hero";
import { GuideSection } from "@/features/warehouse/guide/components/guide-section";
import { GuideVideo } from "@/features/warehouse/guide/components/guide-video";
import { HoldsGuide } from "@/features/warehouse/guide/components/holds-guide";
import { PracticeBench } from "@/features/warehouse/guide/components/practice-bench";
import { PrintingGuide } from "@/features/warehouse/guide/components/printing-guide";
import { ReadyCheck } from "@/features/warehouse/guide/components/ready-check";
import { ScanningGuide } from "@/features/warehouse/guide/components/scanning-guide";
import { ScreenTour } from "@/features/warehouse/guide/components/screen-tour";
import { FirstDay, Mistakes } from "@/features/warehouse/guide/components/static-sections";

export const metadata: Metadata = { title: "Guide" };

/**
 * `/warehouse/guide` — the operator guide (081).
 *
 * One long page rather than a page per topic: a new operator reads it top to
 * bottom once, and after that comes back to one heading from a "Learn how"
 * link — both are served by anchors and a contents list that follows along.
 * Everything interactive on it is local state; nothing here writes to the
 * warehouse, so it is safe to click anything.
 */

const section = (id: string) => {
  const index = SECTIONS.findIndex((s) => s.id === id);
  const s = SECTIONS[index]!;
  return { id, index: index + 1, icon: s.icon };
};

export default function WarehouseGuidePage() {
  return (
    <GuideSpy>
      <div className="flex min-w-0 flex-col gap-6">
        <ContentsBar />
        <GuideHero />

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <ContentsRail />
          </aside>

          <div className="flex min-w-0 flex-col gap-12 pb-8">
            <GuideSection
              {...section("first-day")}
              kicker="Start here"
              title="Your first day"
              lead={
                <>
                  Tomame customers in Ghana buy from US stores. Their parcels arrive here, at the US hub. You log each one in, photograph it,
                  pack it with the rest of that customer&apos;s things, seal the box, label it and send it to Accra. Everything you do moves the
                  customer&apos;s tracking, so they can see it happen.
                </>
              }
            >
              <FirstDay />
            </GuideSection>

            <GuideSection
              {...section("daily-flow")}
              kicker="The job"
              title="The daily flow"
              lead="Six steps, always in this order. Click a step to see what you do, what the customer sees, and the screen itself."
            >
              <FlowDiagram />
            </GuideSection>

            <GuideSection
              {...section("screens")}
              kicker="Find your way"
              title="Every screen, explained"
              lead="On a computer the screens are tabs across the top. On a phone they are along the bottom, with Scan raised in the middle, because scanning is what you do most."
            >
              <ScreenTour />
            </GuideSection>

            <GuideSection
              {...section("printing")}
              kicker="Labels"
              title="Printing labels"
              lead="A label that does not scan is a box that gets lost. Almost every bad label comes from the print dialog, so this chapter has you set one up."
            >
              <PrintingGuide />
            </GuideSection>

            <GuideSection
              {...section("scanning")}
              kicker="Look up"
              title="Scanning"
              lead="Every Tomame label has a QR code and a barcode, and every order has a TM-number. Any of them opens the right screen, however you get it in."
            >
              <ScanningGuide />
            </GuideSection>

            <GuideSection
              {...section("holds")}
              kicker="Customer replies"
              title="Holds & customer issues"
              lead="Customers see your photos and can tell us something is wrong. Sort it while the parcel is still here: once it flies, a mistake is expensive."
            >
              <HoldsGuide />
            </GuideSection>

            <GuideSection
              {...section("consolidated")}
              kicker="Mixed boxes"
              title="Consolidated cartons"
              lead="Sometimes it is cheaper to send several customers' parcels in one carton. That is allowed, as long as it is on purpose."
            >
              <ConsolidatedGuide />
            </GuideSection>

            <GuideSection
              {...section("mistakes")}
              kicker="Undo"
              title="Mistakes, and how to undo them"
              lead="Almost everything before shipping can be put right in a click or two. The two things that cannot be undone at all are marked: for those, contact an admin straight away."
            >
              <Mistakes />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
                <GuideVideo clip="seal" size="sm" />
                <GuideVideo clip="ship" size="sm" />
              </div>
            </GuideSection>

            <GuideSection
              {...section("practice")}
              kicker="Try it"
              title="Practice run"
              lead="A practice bench with three parcels. Log two in, pack them, seal, print and ship. Nothing here touches the real warehouse, and one of the parcels has a surprise."
            >
              <PracticeBench />
            </GuideSection>

            <GuideSection
              {...section("ready")}
              kicker="Check yourself"
              title="Ready for your first shift"
              lead="Tick the things only you can check, then answer eight quick questions. When both are done, the Overview stops offering you the tour."
            >
              <ReadyCheck />
            </GuideSection>

            <GuideSection {...section("faq")} kicker="Questions" title="FAQ" lead="The questions new operators ask in their first week.">
              <FaqList />
            </GuideSection>

            <GuideSection {...section("glossary")} kicker="Words" title="Glossary" lead="The words the app uses, and what they mean on the bench.">
              <GlossaryList />
            </GuideSection>
          </div>
        </div>
      </div>
    </GuideSpy>
  );
}
