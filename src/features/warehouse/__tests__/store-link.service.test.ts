import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/warehouse", () => ({ setOrdersStoreTrackingUrl: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

import { setOrdersStoreTrackingUrl } from "@/db/queries/warehouse";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { PlatformUser } from "@/features/users/types";

import { checkStoreLink, clearStoreTrackingLink, setStoreTrackingLink } from "../services/store-link.service";

const operator = { id: "op-1", email: "op@tomame.test", app_metadata: { role: "warehouse" } } as unknown as PlatformUser;
const redirect = (location: string) => new Response(null, { status: 301, headers: { location } });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("checkStoreLink", () => {
  it("follows an a.co link one hop and keeps it when it opens shared tracking", async () => {
    const fetchMock = vi.fn(async () => redirect("https://www.amazon.com/progress-tracker/package/share/?unauthenticated=1&shareToken=a89e"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkStoreLink("https://a.co/d/0c8Ijdes")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("https://a.co/d/0c8Ijdes", expect.objectContaining({ redirect: "manual" }));
  });

  it("refuses an a.co link that opens a product page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => redirect("https://www.amazon.com/dp/B0CHX1W1XY?ref=share")));
    expect(await checkStoreLink("https://a.co/d/abc1234")).toMatch(/product page/);
  });

  it("refuses a short link that opens nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await checkStoreLink("https://a.co/d/0c8ljdes")).toMatch(/opens nothing/);
  });

  it("keeps the link when the store does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));
    expect(await checkStoreLink("https://a.co/d/0c8Ijdes")).toBeNull();
  });

  it("does not fetch a link that is not a store short link", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkStoreLink("https://www.example-store.com/track/abc")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("setStoreTrackingLink", () => {
  it("writes the link and audits each order written", async () => {
    vi.mocked(setOrdersStoreTrackingUrl).mockResolvedValue(["a"]);
    await setStoreTrackingLink(operator, [{ order_id: "a", order_no: "TM-1" }, { order_id: "b", order_no: "TM-2" }], "https://a.co/d/x");
    expect(setOrdersStoreTrackingUrl).toHaveBeenCalledWith(["a", "b"], "https://a.co/d/x");
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "order_store_tracking_link_set", entityId: "a" }));
  });

  it("clears it, and says when there is no such order", async () => {
    vi.mocked(setOrdersStoreTrackingUrl).mockResolvedValueOnce(["a"]).mockResolvedValueOnce([]);
    await clearStoreTrackingLink(operator, "a");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "order_store_tracking_link_cleared" }));
    await expect(clearStoreTrackingLink(operator, "missing")).rejects.toThrow(/not found/);
  });

  it("refuses someone without warehouse access", async () => {
    const customer = { id: "c", email: "c@x.test", app_metadata: {} } as unknown as PlatformUser;
    await expect(setStoreTrackingLink(customer, [{ order_id: "a", order_no: null }], null)).rejects.toThrow();
  });
});
