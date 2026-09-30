import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/features/ops/ops.service", () => ({ getOpsOverview: vi.fn() }));
vi.mock("@/db/queries/ops-alerts", () => ({
  claimDailySummary: vi.fn(),
  countAlertSendsSince: vi.fn(),
  listAlertLog: vi.fn(),
  listErrorEventsByFingerprint: vi.fn(),
  listErrorEventsSeenSince: vi.fn(),
  listHourlyCountsSince: vi.fn(),
  listRecentAlertSends: vi.fn(),
  readAlertRecipientsSetting: vi.fn(),
  readDayActivity: vi.fn(),
  readNotificationOutcomesSince: vi.fn(),
  recordAlertSend: vi.fn(),
  releaseDailySummary: vi.fn(),
  stampAlertLog: vi.fn(),
}));

import * as q from "@/db/queries/ops-alerts";
import { getOpsOverview } from "@/features/ops/ops.service";
import { runDailySummary, runOpsAlerts, type NotifyDeps } from "@/features/ops/ops-notify.service";
import { FIXTURE_EVENTS, FIXTURE_HOURLY, fixtureJob, SUMMARY_NOW } from "./fixtures";

const PROD = { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://tomame.ca" };
const NOW = new Date(SUMMARY_NOW.getTime());

function deps(env: Record<string, string> = PROD, send = vi.fn().mockResolvedValue(undefined)): NotifyDeps & { send: ReturnType<typeof vi.fn> } {
  return { send, env, now: NOW };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOpsOverview).mockResolvedValue({
    generatedAt: NOW.toISOString(),
    alerts: [],
    jobs: [fixtureJob()],
  } as never);
  // One brand-new 5xx, first seen three minutes ago.
  vi.mocked(q.listErrorEventsSeenSince).mockResolvedValue([
    { ...FIXTURE_EVENTS[1]!, first_seen_at: new Date(NOW.getTime() - 3 * 60_000).toISOString(), resolved_at: null },
  ]);
  vi.mocked(q.listHourlyCountsSince).mockResolvedValue(FIXTURE_HOURLY);
  vi.mocked(q.readNotificationOutcomesSince).mockResolvedValue({ failed: 0, sent: 3 });
  vi.mocked(q.listAlertLog).mockResolvedValue([]);
  vi.mocked(q.countAlertSendsSince).mockResolvedValue(0);
  vi.mocked(q.readAlertRecipientsSetting).mockResolvedValue(["kelanimdev@gmail.com", "ops@example.com"]);
  vi.mocked(q.readDayActivity).mockResolvedValue({ orders: [], payments: [], notifications: [], warehouseActions: [] });
  vi.mocked(q.listErrorEventsByFingerprint).mockResolvedValue([]);
  vi.mocked(q.claimDailySummary).mockResolvedValue(11);
});

describe("runOpsAlerts", () => {
  it("emails every recipient once, then stamps the throttle and records the send", async () => {
    const d = deps();
    const out = await runOpsAlerts(d);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.send.mock.calls.map((c) => c[0].to)).toEqual(["kelanimdev@gmail.com", "ops@example.com"]);
    const mail = d.send.mock.calls[0]![0];
    expect(mail.subject).toBe("[Tomame] New server error");
    expect(mail.html).toContain("/admin/ops");
    expect(mail.html).not.toContain("—");
    expect(q.stampAlertLog).toHaveBeenCalledWith([expect.objectContaining({ key: "error:b" })], NOW.toISOString(), []);
    expect(q.recordAlertSend).toHaveBeenCalledWith(expect.objectContaining({ kind: "alert", recipients: 2, failed: 0 }));
    expect(out).toMatchObject({ sent: 1, recipients: 2 });
  });

  it("evaluates but never sends, or stamps, on a deployment that is not production", async () => {
    const d = deps({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://dev.tomame.ca" });
    const out = await runOpsAlerts(d);
    expect(d.send).not.toHaveBeenCalled();
    expect(q.stampAlertLog).not.toHaveBeenCalled();
    expect(out).toMatchObject({ dryRun: true, wouldSend: 1, subject: "[Tomame dev] New server error" });
  });

  it("sends nothing for an alert already emailed this hour", async () => {
    vi.mocked(q.listAlertLog).mockResolvedValue([{ alert_key: "error:b", level: "critical", title: "x", last_sent_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(), times_sent: 1 }]);
    const d = deps();
    expect(await runOpsAlerts(d)).toMatchObject({ sent: 0, throttled: 1 });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("fails the run and stamps nothing when no recipient could be reached, so the next run retries", async () => {
    const d = deps(PROD, vi.fn().mockRejectedValue(new Error("Resend error: 401")));
    await expect(runOpsAlerts(d)).rejects.toThrow(/reached none of 2/);
    expect(q.stampAlertLog).not.toHaveBeenCalled();
  });

  it("uses OPS_ALERT_RECIPIENTS over the setting", async () => {
    const d = deps({ ...PROD, OPS_ALERT_RECIPIENTS: "oncall@example.com" });
    await runOpsAlerts(d);
    expect(d.send.mock.calls.map((c) => c[0].to)).toEqual(["oncall@example.com"]);
  });
});

describe("runDailySummary", () => {
  it("claims the day, sends the summary and records it", async () => {
    const d = deps();
    const out = await runDailySummary(d);
    expect(q.claimDailySummary).toHaveBeenCalledWith("2026-10-01", expect.stringContaining("Daily health, 2026-10-01"));
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(q.recordAlertSend).toHaveBeenCalledWith(expect.objectContaining({ id: 11, kind: "daily_summary" }));
    expect(out).toMatchObject({ sent: true, date: "2026-10-01" });
  });

  it("does nothing on the second call of the morning", async () => {
    vi.mocked(q.claimDailySummary).mockResolvedValue(null);
    const d = deps();
    expect(await runDailySummary(d)).toEqual({ skipped: "already sent", date: "2026-10-01" });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("gives the day back when every send failed, so a later call in the hour can retry", async () => {
    const d = deps(PROD, vi.fn().mockRejectedValue(new Error("down")));
    await expect(runDailySummary(d)).rejects.toThrow();
    expect(q.releaseDailySummary).toHaveBeenCalledWith(11);
  });
});
