import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99, resetAt: 0 })),
  getClientIp: () => "203.0.113.9",
}));
vi.mock("@/lib/env", () => ({
  env: {
    whatsapp: {
      get appSecret() { return process.env.WHATSAPP_APP_SECRET || null; },
      get verifyToken() { return process.env.WHATSAPP_VERIFY_TOKEN || null; },
    },
  },
}));
vi.mock("@/features/notifications/services/whatsapp.service", () => ({
  applyWhatsAppStatuses: vi.fn(async (u: unknown[]) => ({ updated: u.length, ignored: 0, unknown: 0 })),
}));

import { GET, POST } from "../route";
import { applyWhatsAppStatuses } from "@/features/notifications/services/whatsapp.service";
import { signWhatsAppBody } from "@/lib/whatsapp/signature";

const apply = vi.mocked(applyWhatsAppStatuses);
const URL_BASE = "https://tomame.test/api/webhooks/whatsapp";

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1759219200" }], messages: [{ id: "in" }] } }] }],
});

function post(raw: string, signature: string | null) {
  return new NextRequest(URL_BASE, {
    method: "POST",
    body: raw,
    headers: signature ? { "x-hub-signature-256": signature } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_APP_SECRET = "app-secret";
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
});

describe("GET handshake", () => {
  it("echoes the challenge for the right token", async () => {
    const res = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("refuses a wrong token, and answers 503 when unconfigured", async () => {
    expect((await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`))).status).toBe(403);
    process.env.WHATSAPP_VERIFY_TOKEN = "";
    expect((await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`))).status).toBe(503);
  });
});

describe("POST status callbacks", () => {
  it("applies statuses from a correctly signed body", async () => {
    const res = await POST(post(body, signWhatsAppBody(body, "app-secret")));
    expect(res.status).toBe(200);
    expect(apply).toHaveBeenCalledWith([
      { messageId: "wamid.1", status: "delivered", at: "2025-09-30T08:00:00.000Z", errorCode: null, errorReason: null },
    ]);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain('"inbound":1');
  });

  it("rejects a bad or missing signature without touching a row", async () => {
    expect((await POST(post(body, signWhatsAppBody(body, "wrong")))).status).toBe(401);
    expect((await POST(post(body, null))).status).toBe(401);
    expect(apply).not.toHaveBeenCalled();
  });

  it("answers 503 when the app secret is not configured", async () => {
    process.env.WHATSAPP_APP_SECRET = "";
    expect((await POST(post(body, signWhatsAppBody(body, "app-secret")))).status).toBe(503);
    expect(apply).not.toHaveBeenCalled();
  });
});
