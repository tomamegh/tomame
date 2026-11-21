import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/finder-chats", () => ({
  getFinderChatForViewer: vi.fn(),
  insertFinderChat: vi.fn(),
  insertFinderChatMessage: vi.fn(),
  listFinderChatMessages: vi.fn(),
  listFinderChatsForViewer: vi.fn(),
  listLatestMessages: vi.fn(),
  touchFinderChat: vi.fn(),
}));
vi.mock("@/db/queries/finder-runs", () => ({ findRecentFinderRun: vi.fn(), insertFinderRun: vi.fn(), listFinderRunsByIds: vi.fn(async () => []) }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn(async () => ({})) }));
vi.mock("../services/finder-chat-ai.service", () => ({ planChatTurn: vi.fn() }));
vi.mock("../services/finder-notify.service", () => ({ finderRecipient: vi.fn(async () => null), notifyFinderTurn: vi.fn() }));
vi.mock("../services/finder-run.service", () => ({ toFinderRunView: vi.fn() }));

import { getFinderChatForViewer, insertFinderChat, insertFinderChatMessage, listFinderChatMessages } from "@/db/queries/finder-chats";
import { findRecentFinderRun, insertFinderRun } from "@/db/queries/finder-runs";

import { planChatTurn } from "../services/finder-chat-ai.service";
import { searchLabel, sendChatMessage } from "../services/finder-chat.service";

const viewer = { userId: "u1", sessionId: null };
const spec = (product: string, mustHaves: string[] = []) => ({ product, searchQuery: product, mustHaves, budgetGhs: null, newOnly: true, category: null });
let runSeq = 0;
let msgs: { id: string; role: "user" | "assistant"; content: string; run_ids: string[] }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  runSeq = 0;
  msgs = [];
  vi.mocked(insertFinderChat).mockResolvedValue({ id: "chat-1", user_id: "u1", session_id: null, title: "t", email: null, created_at: "", updated_at: "" });
  vi.mocked(insertFinderChatMessage).mockImplementation(async (m) => {
    const row = { id: `m${msgs.length}`, chat_id: m.chatId, role: m.role, content: m.content, run_ids: m.runIds ?? [], emailed_at: null, created_at: "" };
    msgs.push(row);
    return row;
  });
  vi.mocked(listFinderChatMessages).mockImplementation(async () => msgs as never);
  vi.mocked(findRecentFinderRun).mockResolvedValue(null);
  vi.mocked(insertFinderRun).mockImplementation(async (input) => ({ id: `run-${++runSeq}`, query: input.query }) as never);
});

describe("sendChatMessage", () => {
  it("starts one search per item, each named for the item, not the sentence", async () => {
    vi.mocked(planChatTurn).mockResolvedValue({ reply: "Searching for both.", searches: [spec("iPhone 17 Pro", ["unlocked"]), spec("Desktop monitor")] });
    const out = await sendChatMessage(viewer, { chatId: null, text: "cheapest iphone 17 pro and a desktop monitor", email: null }, async () => true, "limit");

    expect(out.newRunIds).toEqual(["run-1", "run-2"]);
    expect(vi.mocked(insertFinderRun).mock.calls.map((c) => [c[0].query, c[0].spec])).toEqual([
      ["iPhone 17 Pro, unlocked", expect.objectContaining({ product: "iPhone 17 Pro", mustHaves: ["unlocked"] })],
      ["Desktop monitor", expect.objectContaining({ product: "Desktop monitor" })],
    ]);
    expect(out.turn).toMatchObject({ role: "assistant", content: "Searching for both.", run_ids: ["run-1", "run-2"] });
  });

  it("reuses the same item searched recently, and says so when the limit stops one", async () => {
    vi.mocked(planChatTurn).mockResolvedValue({ reply: "On it.", searches: [spec("AirPods Pro 3"), spec("Switch 2")] });
    vi.mocked(findRecentFinderRun).mockImplementation(async (_v, key) => (key.startsWith("airpods") ? ({ id: "old-run" } as never) : null));
    const out = await sendChatMessage(viewer, { chatId: null, text: "airpods and a switch", email: null }, async () => false, "You have used today's searches.");

    expect(out.newRunIds).toEqual([]);
    expect(out.turn.run_ids).toEqual(["old-run"]);
    expect(out.turn.content).toBe("On it. You have used today's searches.");
  });

  it("searches the message as one item when the assistant cannot be reached", async () => {
    vi.mocked(planChatTurn).mockResolvedValue(null);
    const out = await sendChatMessage(viewer, { chatId: null, text: "ps5 pro", email: null }, async () => true, "limit");
    expect(out.newRunIds).toEqual(["run-1"]);
    expect(vi.mocked(insertFinderRun).mock.calls[0]![0]).toMatchObject({ query: "ps5 pro" });
    expect(vi.mocked(insertFinderRun).mock.calls[0]![0].spec).toBeUndefined();
  });

  it("refuses a chat that is not the viewer's", async () => {
    vi.mocked(getFinderChatForViewer).mockResolvedValue(null);
    await expect(sendChatMessage(viewer, { chatId: "someone-else", text: "hi", email: null }, async () => true, "limit")).rejects.toMatchObject({ statusCode: 404 });
    expect(insertFinderChatMessage).not.toHaveBeenCalled();
  });
});

describe("searchLabel", () => {
  it("adds must-haves the product name does not already say", () => {
    expect(searchLabel({ product: "iPhone 17 Pro unlocked", mustHaves: ["unlocked", "256GB"] })).toBe("iPhone 17 Pro unlocked, 256GB");
  });
});
