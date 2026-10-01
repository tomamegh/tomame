import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/auth/services/auth.service", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/auth/admin-access", () => ({ canAccessAdmin: (u: { role?: string }) => u?.role === "admin" }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/db/queries/admin-content", () => ({ getSiteSetting: vi.fn(), updateSiteSettingValue: vi.fn() }));
vi.mock("@/db/queries/staff-alerts", () => ({ listRecentStaffAlertSends: vi.fn(async () => []), readSiteSettingValues: vi.fn(async () => ({})) }));
vi.mock("@/features/staff-alerts/staff-alerts.service", () => ({ sendStaffTestEmail: vi.fn() }));

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getSiteSetting, updateSiteSettingValue } from "@/db/queries/admin-content";
import { sendStaffTestEmail } from "@/features/staff-alerts/staff-alerts.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { GET, PUT } from "../route";
import { POST as TEST } from "../test/route";

const ADMIN = { id: "admin-1", email: "boss@tomame.ca", role: "admin" };
const CUSTOMER = { id: "u-1", email: "c@x.io", role: "user" };

function put(body: unknown) {
  return new Request("http://localhost/api/admin/staff-alerts", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}
const get = () => new Request("http://localhost/api/admin/staff-alerts") as never;
const post = () => new Request("http://localhost/api/admin/staff-alerts/test", { method: "POST" }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(getAuthenticatedUser).mockResolvedValue(ADMIN as never);
  vi.mocked(getSiteSetting).mockImplementation(async (key: string) =>
    (key === "staff_order_alert_recipients"
      ? { key, value: ["old@x.io"] }
      : { key, value: { order_placed: true } }) as never,
  );
  vi.mocked(updateSiteSettingValue).mockImplementation(async (key: string, value: unknown) => ({ key, value }) as never);
});

describe("/api/admin/staff-alerts", () => {
  it("401s signed out, 403s a customer, on every method", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    vi.mocked(getAuthenticatedUser).mockResolvedValue(CUSTOMER as never);
    expect((await GET(get())).status).toBe(403);
    expect((await PUT(put({ recipients: ["a@x.io"], events: {} }))).status).toBe(403);
    expect((await TEST(post())).status).toBe(403);
    expect(updateSiteSettingValue).not.toHaveBeenCalled();
    expect(sendStaffTestEmail).not.toHaveBeenCalled();
  });

  it("429s when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    expect((await PUT(put({ recipients: ["a@x.io"], events: {} }))).status).toBe(429);
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("400s bad JSON, a bad address, an empty list and an unknown event", async () => {
    expect((await PUT(put("{nope"))).status).toBe(400);
    expect((await PUT(put({ recipients: ["nope"], events: {} }))).status).toBe(400);
    expect((await PUT(put({ recipients: [], events: {} }))).status).toBe(400);
    expect((await PUT(put({ recipients: ["a@x.io"], events: { made_up: true } }))).status).toBe(400);
    expect(updateSiteSettingValue).not.toHaveBeenCalled();
  });

  it("saves both rows and audits each with before and after", async () => {
    const res = await PUT(put({ recipients: ["New@X.io", "new@x.io"], events: { payment_failed: false } }));
    expect(res.status).toBe(200);
    expect(updateSiteSettingValue).toHaveBeenCalledWith("staff_order_alert_recipients", ["new@x.io"], "admin-1");
    expect(updateSiteSettingValue).toHaveBeenCalledWith(
      "staff_order_alert_events",
      expect.objectContaining({ payment_failed: false, order_placed: true }),
      "admin-1",
    );
    expect(logAuditEvent).toHaveBeenCalledTimes(2);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "staff_alert_settings_updated",
        metadata: expect.objectContaining({ key: "staff_order_alert_recipients", previousValue: ["old@x.io"], newValue: ["new@x.io"] }),
      }),
    );
  });

  it("writes and audits nothing that did not change", async () => {
    const res = await PUT(put({ recipients: ["old@x.io"], events: {} }));
    expect(res.status).toBe(200);
    expect(updateSiteSettingValue).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("409s when the migration has not been applied", async () => {
    vi.mocked(getSiteSetting).mockResolvedValue(null);
    expect((await PUT(put({ recipients: ["a@x.io"], events: {} }))).status).toBe(409);
  });

  it("the test send is audited, and a total failure is a 502", async () => {
    vi.mocked(sendStaffTestEmail).mockResolvedValue({ status: "sent", subject: "s", recipients: 2, failed: 0 });
    expect((await TEST(post())).status).toBe(200);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "staff_alert_test_sent", actorId: "admin-1" }));
    vi.mocked(sendStaffTestEmail).mockResolvedValue({ status: "failed", error: "Resend error" });
    expect((await TEST(post())).status).toBe(502);
  });
});
