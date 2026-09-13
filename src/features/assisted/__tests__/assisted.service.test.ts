import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/assisted-requests", () => ({
  insertAssistedRequest: vi.fn(),
  findOpenAssistedRequest: vi.fn(async () => null),
  listAssistedRequests: vi.fn(async () => []),
  transitionAssistedRequest: vi.fn(),
}));
vi.mock("@/db/queries/extraction-requests", () => ({ getExtractionRequestById: vi.fn() }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn(async () => ({ whatsapp_number: "+233 59 442 4746" })) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import {
  findOpenAssistedRequest,
  insertAssistedRequest,
  transitionAssistedRequest,
} from "@/db/queries/assisted-requests";
import { getExtractionRequestById } from "@/db/queries/extraction-requests";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { APIError } from "@/lib/auth/api-helpers";
import { createAssistedRequest, moveAssistedRequest } from "../services/assisted.service";

const VIEWER = { userId: "u1", sessionId: null };
const SESSION_VIEWER = { userId: null, sessionId: "sess-1" };

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "ar-1",
    user_id: "u1",
    session_id: null,
    extraction_request_id: "req-1",
    product_url: "https://store.test/p/1",
    description: "the 32GB one",
    phone: "0245550192",
    status: "open",
    handled_by: null,
    contacted_at: null,
    note: null,
    created_at: "2026-09-13T10:00:00Z",
    updated_at: "2026-09-13T10:00:00Z",
    ...over,
  }) as never;

const input = { extraction_request_id: "req-1", description: "the 32GB one please", phone: "0245550192" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findOpenAssistedRequest).mockResolvedValue(null);
  vi.mocked(insertAssistedRequest).mockResolvedValue(row());
  vi.mocked(getExtractionRequestById).mockResolvedValue({
    id: "req-1",
    user_id: "u1",
    session_id: null,
    product_url: "https://store.test/p/1",
  } as never);
  vi.mocked(getSiteSettingsMap).mockResolvedValue({ whatsapp_number: "+233 59 442 4746" } as never);
});

describe("createAssistedRequest", () => {
  it("takes the link from the paste, never from the body", async () => {
    await createAssistedRequest(VIEWER, {
      ...input,
      // A tampered body naming a different link must not reach the buyer.
      product_url: "https://evil.test/somewhere-else",
    });

    expect(insertAssistedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ productUrl: "https://store.test/p/1" }),
    );
  });

  it("refuses a paste belonging to someone else", async () => {
    vi.mocked(getExtractionRequestById).mockResolvedValue({
      id: "req-1", user_id: "someone-else", session_id: null, product_url: "https://store.test/p/1",
    } as never);

    await expect(createAssistedRequest(VIEWER, input)).rejects.toBeInstanceOf(APIError);
    expect(insertAssistedRequest).not.toHaveBeenCalled();
  });

  it("matches a session's own paste through the cookie", async () => {
    vi.mocked(getExtractionRequestById).mockResolvedValue({
      id: "req-1", user_id: null, session_id: "sess-1", product_url: "https://store.test/p/1",
    } as never);

    await expect(createAssistedRequest(SESSION_VIEWER, input)).resolves.toMatchObject({ id: "ar-1" });
  });

  it("reuses an open request instead of queueing the same job twice", async () => {
    vi.mocked(findOpenAssistedRequest).mockResolvedValue(row({ id: "already-there" }));

    const result = await createAssistedRequest(VIEWER, input);

    expect(result.id).toBe("already-there");
    expect(insertAssistedRequest).not.toHaveBeenCalled();
  });

  it("hands back Tomame's WhatsApp link so the customer can start the chat", async () => {
    const result = await createAssistedRequest(VIEWER, input);
    expect(result.whatsapp_href).toBe("https://wa.me/233594424746");
  });

  it("still records the request when the support number cannot be read", async () => {
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("settings down"));

    const result = await createAssistedRequest(VIEWER, input);

    expect(insertAssistedRequest).toHaveBeenCalled();
    expect(result.whatsapp_href).toBeNull();
  });

  it("never returns the phone number to the browser", async () => {
    const result = await createAssistedRequest(VIEWER, input);
    expect(JSON.stringify(result)).not.toContain("0245550192");
  });

  it("refuses a viewer we cannot identify at all", async () => {
    await expect(
      createAssistedRequest({ userId: null, sessionId: null }, input),
    ).rejects.toBeInstanceOf(APIError);
  });
});

describe("moveAssistedRequest", () => {
  it("refuses when another buyer already moved it", async () => {
    vi.mocked(transitionAssistedRequest).mockResolvedValue(null);

    await expect(
      moveAssistedRequest("admin-1", "ar-1", "open", { status: "contacted" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("guards the transition on the status the buyer saw", async () => {
    vi.mocked(transitionAssistedRequest).mockResolvedValue(row({ status: "contacted" }));

    await moveAssistedRequest("admin-1", "ar-1", "open", { status: "contacted" });

    expect(transitionAssistedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ from: "open", to: "contacted", handledBy: "admin-1" }),
    );
  });
});
