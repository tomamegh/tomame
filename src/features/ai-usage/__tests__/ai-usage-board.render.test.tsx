import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiUsageBoard } from "../components/ai-usage-board";
import { dailyCounts, dayRange } from "../summary";

describe("AI use board", () => {
  it("shows the day's totals, a flagged visitor first, and a named customer", () => {
    const html = renderToStaticMarkup(
      <AiUsageBoard
        today="2026-11-23"
        view={{
          day: "2026-11-23",
          totals: { chats: 31, searches: 4, refused: 2, customers: 1, visitors: 1, inputTokens: 12000, outputTokens: 900 },
          people: [
            { key: "ip:abc123def456", userId: null, kind: "visitor", chats: 30, searches: 3, refused: 2, inputTokens: 11000, outputTokens: 800, first: "2026-11-23T08:00:00Z", last: "2026-11-23T14:00:00Z", sessions: 5, flagged: true, name: null, email: null },
            { key: "user:u1", userId: "u1", kind: "customer", chats: 1, searches: 1, refused: 0, inputTokens: 1000, outputTokens: 100, first: "2026-11-23T09:00:00Z", last: "2026-11-23T09:05:00Z", sessions: 0, flagged: false, name: "Ama Mensah", email: "ama@example.com" },
          ],
          trend: dailyCounts([], dayRange("2026-11-23", 14)),
        }}
      />,
    );
    expect(html).toContain("Today, Mon 23 Nov");
    expect(html).toContain("1 to look at");
    expect(html).toContain("Visitor · abc123de");
    expect(html).toContain("5 cookies");
    expect(html).toContain("Ama Mensah");
    expect(html).toContain("12,900");
  });
});
