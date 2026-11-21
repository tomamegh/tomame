import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeHistoryCard } from "../components/home-history-card";

const now = new Date("2026-11-21T20:00:00Z");

describe("HomeHistoryCard", () => {
  it("lists chats with what they found, and pasted links with where they stand", () => {
    const html = renderToStaticMarkup(
      <HomeHistoryCard
        now={now}
        history={{
          chats: [
            {
              id: "c1",
              title: "Cheapest iPhone 17 Pro and a monitor",
              updatedAt: "2026-11-21T19:55:00Z",
              items: [
                { product: "iPhone 17 Pro", status: "done", totalGhs: 17505.51, imageUrl: null },
                { product: "Monitor", status: "running", totalGhs: null, imageUrl: null },
              ],
            },
          ],
          pastes: [{ id: "p1", title: "JBL Flip 6", storeHost: "amazon.com", outcome: "priced", href: "/app/orders/review/x", pastedAt: "2026-11-20T10:00:00Z" }],
        }}
      />,
    );
    expect(html).toContain('id="onboarding-tour-history"');
    expect(html).toContain('href="/app/find/chat/c1"');
    expect(html).toContain("iPhone 17 Pro · GH₵17,505.51");
    expect(html).toContain("Monitor · searching");
    expect(html).toContain("5 min ago");
    expect(html).toContain('href="/app/orders/review/x"');
    expect(html).toContain("Priced");
  });

  it("offers the two ways in when there is nothing yet", () => {
    const html = renderToStaticMarkup(<HomeHistoryCard now={now} history={{ chats: [], pastes: [] }} />);
    expect(html).toContain("Ask the assistant");
    expect(html).toContain("Paste a link");
  });
});
