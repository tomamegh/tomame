import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/auth/services/auth.service", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/features/sourcing/services/sourcing.service", () => ({ requestSourcing: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/quote-session", () => ({
  resolveViewer: vi.fn(() => ({ viewer: { userId: "u1", sessionId: null }, finalize: (r: Response) => r })),
}));

import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requestSourcing } from "@/features/sourcing/services/sourcing.service";
import type { PlatformUser } from "@/features/users/types";
import { POST } from "../route";

const CACHE_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const user = { id: "u1", profile: { role: "user", first_name: "Kwame", last_name: null, phone: null } } as unknown as PlatformUser;

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/sourcing-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user);
  vi.mocked(requestSourcing).mockResolvedValue({ watch_id: "w1", cart_item_id: "l1", item_count: 1, status: "requested" });
});

describe("POST /api/sourcing-requests — contact details (097)", () => {
  it("401s a signed-out visitor before reading the body", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const res = await post({ extraction_cache_id: CACHE_ID, contact_name: "K", contact_phone: "0244123456" });
    expect(res.status).toBe(401);
    expect(requestSourcing).not.toHaveBeenCalled();
  });

  it("passes the service a normalised phone, whatever the customer typed", async () => {
    const res = await post({ extraction_cache_id: CACHE_ID, quantity: 2, contact_name: " Kwame  Mensah", contact_phone: "024-412-3456" });
    expect(res.status).toBe(201);
    expect(requestSourcing).toHaveBeenCalledWith(
      user,
      { userId: "u1", sessionId: null },
      expect.objectContaining({ contact_name: "Kwame Mensah", contact_phone: "+233244123456", quantity: 2 }),
    );
  });

  it("answers a null phone (blank profile prefill) with the plain message, not a type error", async () => {
    const res = await post({ extraction_cache_id: CACHE_ID, contact_name: "Kwame", contact_phone: null });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("Enter a phone number we can reach you on");
    expect(requestSourcing).not.toHaveBeenCalled();
  });

  it("400s a number that cannot be a Ghana number, saying what we want", async () => {
    const res = await post({ extraction_cache_id: CACHE_ID, contact_name: "Kwame", contact_phone: "12345" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("024 412 3456");
  });

  it("400s a missing name", async () => {
    const res = await post({ extraction_cache_id: CACHE_ID, contact_name: null, contact_phone: "0244123456" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("Tell us your name");
  });
});
