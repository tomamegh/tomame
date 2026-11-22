import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FinderExperience } from "../components/finder-experience";
import { finderResultTemplate } from "../email/finder-result-email";
import { FINDER_SCENARIOS } from "../fixtures";
import { reduceFinderEvents, selectRankedCandidates } from "../state/reducer";

function render(key: string) {
  const scenario = FINDER_SCENARIOS.find((s) => s.key === key)!;
  const state =
    scenario.jumpTo == null ? reduceFinderEvents([]) : reduceFinderEvents(scenario.run.filter((e) => e.at <= scenario.jumpTo!));
  return renderToStaticMarkup(
    <FinderExperience
      state={state}
      elapsedMs={42_000}
      customerEmail="akosua.mensah@example.com"
      whatsappOptIn={false}
      onWhatsappOptInChange={() => {}}
      onSubmit={() => {}}
      onReset={() => {}}
      buyerWhatsappNumber="0594424746"
    />,
  );
}

describe("FinderExperience renders every preview state", () => {
  it("asking", () => {
    const html = render("asking");
    expect(html).toContain("What do you want to buy?");
    expect(html).toContain("Kids&#x27; scooter for a 6-year-old");
  });

  it("working", () => {
    const html = render("working");
    expect(html).toContain("This usually takes about a minute.");
    expect(html).toContain("Matches so far");
    expect(html).toContain("We&#x27;ll email you the best price");
  });

  it("result", () => {
    const html = render("result");
    expect(html).toContain("Best price, landed in Accra");
    expect(html).toContain("Tomame fee – 4% flat on the item price");
    expect(html).toContain("Customs &amp; clearance – Included in freight – GH₵0 extra");
    expect(html).toContain("GH₵934.16");
  });

  it("still confirming", () => {
    const html = render("confirming");
    expect(html).toContain("Confirming price");
    expect(html).toContain("check the seller before you buy.");
  });

  it("nothing found", () => {
    const html = render("nothing_found");
    expect(html).toContain("A buyer can find this for you");
    expect(html).toContain("https://wa.me/233594424746?text=");
  });

  it("email", () => {
    const state = reduceFinderEvents(FINDER_SCENARIOS.find((s) => s.key === "result")!.run);
    const [best, ...alternatives] = selectRankedCandidates(state);
    const email = finderResultTemplate({ query: state.query!, best: best!, alternatives });
    expect(email.subject).toContain("GH₵934.16");
    expect(email.html).toContain("Freight, incl. customs &amp; clearance");
    expect(email.text).toContain("Other options");
  });
});
