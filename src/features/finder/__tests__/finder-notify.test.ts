import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
vi.mock("@/db/queries/notifications", () => ({ getRecipientEmail: vi.fn(async () => "kwame@example.com") }));
vi.mock("@/features/notifications/services/whatsapp.service", () => ({ queueWhatsApp: vi.fn() }));
vi.mock("@/db/queries/finder-runs", () => ({ markFinderRunEmailed: vi.fn(async () => true), clearFinderRunEmailed: vi.fn(), listFinderRunsByIds: vi.fn() }));
vi.mock("@/db/queries/finder-chats", () => ({
  claimFinderTurnEmail: vi.fn(),
  clearFinderTurnEmailed: vi.fn(),
  getFinderChatById: vi.fn(async () => ({ id: "chat-1", user_id: "u1", email: null })),
  listTurnsForRun: vi.fn(),
}));

import { claimFinderTurnEmail, listTurnsForRun } from "@/db/queries/finder-chats";
import { listFinderRunsByIds, markFinderRunEmailed } from "@/db/queries/finder-runs";
import { sendEmail } from "@/lib/email/transport";

import { notifyFinderFinished } from "../services/finder-notify.service";
import type { FinderEvent } from "../types";

const doneEvents = (product: string, title: string, total: number): FinderEvent[] => [
  { type: "run_started", at: 0, query: product, budgetGhs: null },
  { type: "spec_parsed", at: 1, spec: { product, mustHaves: [], budgetGhs: null, newOnly: true } },
  { type: "candidate_found", at: 2, candidate: { id: `c-${product}`, title, store: { id: "amazon", name: "Amazon" }, productUrl: "https://www.amazon.com/dp/x", imageUrl: null, condition: "New", listingPriceUsd: 100, seller: null } },
  { type: "candidate_priced", at: 3, candidateId: `c-${product}`, quote: { totalGhs: total, totalUsd: 0, exchangeRate: 12, rows: [] }, stockCheck: false },
  { type: "result_ready", at: 4, bestId: `c-${product}`, alternativeIds: [], why: {} },
];
const run = (id: string, product: string, title: string, total: number) =>
  ({ id, user_id: "u1", email: null, query: product, status: "done", notify_whatsapp: false, events: doneEvents(product, title, total) }) as never;

beforeEach(() => vi.clearAllMocks());

describe("notifyFinderFinished", () => {
  it("names the item in a one-line search's subject, not the sentence typed", async () => {
    vi.mocked(listTurnsForRun).mockResolvedValue([]);
    await notifyFinderFinished({ ...(run("r1", "iPhone 17 Pro", "Apple iPhone 17 Pro", 16500) as object), query: "Can you get me the cheapest iphone 17 pro" } as never, null);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].subject).toBe('Best price for "iPhone 17 Pro": GH₵16,500.00 landed');
  });

  it("sends a chat turn's runs as one email, once the turn's claim is won", async () => {
    const turn = { id: "m1", chat_id: "chat-1", run_ids: ["r1", "r2"] };
    vi.mocked(listTurnsForRun).mockResolvedValue([turn as never]);
    vi.mocked(listFinderRunsByIds).mockResolvedValue([run("r1", "iPhone 17 Pro", "Apple iPhone 17 Pro", 16500), run("r2", "Desktop monitor", "Acer 24in Monitor", 2100)]);
    vi.mocked(claimFinderTurnEmail).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await notifyFinderFinished(run("r1", "iPhone 17 Pro", "x", 1), null)).toBe("sent");
    expect(await notifyFinderFinished(run("r2", "Desktop monitor", "x", 1), null)).toBe("already");
    expect(markFinderRunEmailed).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].subject).toBe("Your prices for iPhone 17 Pro and Desktop monitor");
  });
});
