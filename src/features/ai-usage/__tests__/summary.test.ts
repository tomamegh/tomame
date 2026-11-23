import { describe, expect, it } from "vitest";

import type { AiUsageRow } from "@/db/queries/ai-usage";
import { AI_USAGE_FLAG, dailyCounts, dayRange, summariseAiUsage } from "../summary";

let seq = 0;
const row = (over: Partial<AiUsageRow>): AiUsageRow => ({
  id: `r${++seq}`,
  created_at: "2026-11-23T10:00:00Z",
  user_id: null,
  session_id: "s1",
  ip_hash: "abc",
  kind: "chat",
  outcome: "ok",
  ref_id: null,
  input_tokens: 100,
  output_tokens: 20,
  ...over,
});

describe("summariseAiUsage", () => {
  it("counts a customer by account and a visitor by IP, however many cookies", () => {
    const { totals, people } = summariseAiUsage([
      row({ user_id: "u1", session_id: null, ip_hash: null }),
      row({ user_id: "u1", session_id: null, ip_hash: null, kind: "search", created_at: "2026-11-23T12:00:00Z" }),
      row({ session_id: "s1" }),
      row({ session_id: "s2" }),
    ]);
    expect(totals).toMatchObject({ chats: 3, searches: 1, customers: 1, visitors: 1, inputTokens: 400, outputTokens: 80 });
    const customer = people.find((p) => p.kind === "customer")!;
    expect(customer).toMatchObject({ chats: 1, searches: 1, first: "2026-11-23T10:00:00Z", last: "2026-11-23T12:00:00Z" });
    expect(people.find((p) => p.kind === "visitor")).toMatchObject({ chats: 2, sessions: 2, flagged: false });
  });

  it("flags heavy use, anyone turned away, and an IP clearing cookies, and puts them first", () => {
    const heavy = Array.from({ length: AI_USAGE_FLAG.visitor.chats + 1 }, () => row({ ip_hash: "heavy" }));
    const cookies = ["a", "b", "c", "d"].map((s) => row({ ip_hash: "jar", session_id: s }));
    const { people, totals } = summariseAiUsage([row({ user_id: "u2", ip_hash: null }), row({ ip_hash: "wall", outcome: "sign_in_required" }), ...heavy, ...cookies]);
    expect(people.filter((p) => p.flagged).map((p) => p.key).sort()).toEqual(["ip:heavy", "ip:jar", "ip:wall"]);
    expect(people.at(-1)?.key).toBe("user:u2");
    expect(totals.refused).toBe(1);
  });
});

describe("dailyCounts / dayRange", () => {
  it("fills every day, oldest first", () => {
    const days = dayRange("2026-11-23", 3);
    expect(days).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
    const counts = dailyCounts([row({ created_at: "2026-11-23T01:00:00Z" }), row({ created_at: "2026-11-21T01:00:00Z", kind: "search" }), row({ created_at: "2026-11-23T02:00:00Z", outcome: "rate_limited" })], days);
    expect(counts).toEqual([
      { day: "2026-11-21", chats: 0, searches: 1, refused: 0 },
      { day: "2026-11-22", chats: 0, searches: 0, refused: 0 },
      { day: "2026-11-23", chats: 1, searches: 0, refused: 1 },
    ]);
  });
});
