import { describe, expect, it } from "vitest";

import {
  ALERT_RULES,
  alertSubject,
  errorEventCandidates,
  hourlyWindow,
  isContractError,
  notificationCandidates,
  opsSnapshotCandidates,
  selectAlertsToSend,
  spikeCandidates,
  type AlertCandidate,
  type ErrorEventInput,
  type HourlyCountInput,
} from "@/features/ops/alert-rules";

const NOW = new Date("2026-09-30T12:07:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function event(overrides: Partial<ErrorEventInput> = {}): ErrorEventInput {
  return {
    fingerprint: "fp1",
    level: "error",
    category: "server_5xx",
    message: "Unhandled error in API route: boom",
    source: "api:/api/app/me",
    occurrences: 1,
    first_seen_at: ago(3),
    last_seen_at: ago(3),
    ...overrides,
  };
}

function bucket(hoursAgo: number, occurrences: number, overrides: Partial<HourlyCountInput> = {}): HourlyCountInput {
  const b = new Date(NOW);
  b.setUTCMinutes(0, 0, 0);
  return { fingerprint: "fp", bucket: new Date(b.getTime() - hoursAgo * 3600_000).toISOString(), category: "server_5xx", level: "error", occurrences, ...overrides };
}

describe("errorEventCandidates", () => {
  it("alerts on the first occurrence of a new 5xx, critical", () => {
    const [c] = errorEventCandidates([event()], NOW);
    expect(c).toMatchObject({ key: "error:fp1", level: "critical", title: "New server error" });
    expect(c!.detail).toContain("/api/app/me");
  });

  it("stays quiet about an old issue that recurs, unless it is a payment fault", () => {
    const old = { first_seen_at: ago(3 * 24 * 60), last_seen_at: ago(2) };
    expect(errorEventCandidates([event(old)], NOW)).toEqual([]);
    expect(errorEventCandidates([event({ ...old, category: "payment", message: "Paystack verification failed" })], NOW)[0]).toMatchObject({ level: "critical", title: "Payment fault still happening" });
  });

  it("emails a refused form only when the wording is a contract bug, not a typo", () => {
    const contract = event({ category: "client_4xx", level: "warn", message: "400 from PATCH /api/app/me: Invalid input: expected string, received null", source: "client:4xx PATCH /api/app/me" });
    const typo = event({ fingerprint: "fp2", category: "client_4xx", level: "warn", message: "400 from POST /api/addresses: Enter a phone number we can call", source: "client:4xx POST /api/addresses" });
    const out = errorEventCandidates([contract, typo], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "error:fp1", level: "warning", title: "A form is being refused by its own API" });
  });

  it("ignores tracked warnings (they count toward spikes instead)", () => {
    expect(errorEventCandidates([event({ level: "warn", category: "payment" })], NOW)).toEqual([]);
  });

  it("forgets a new issue once it is older than the window", () => {
    expect(errorEventCandidates([event({ first_seen_at: ago(ALERT_RULES.newErrorWindowMinutes + 1), last_seen_at: ago(ALERT_RULES.newErrorWindowMinutes + 1) })], NOW)).toEqual([]);
  });
});

describe("isContractError", () => {
  it("knows zod's type errors from rule messages", () => {
    expect(isContractError("Invalid input: expected string, received null")).toBe(true);
    expect(isContractError('Unrecognized key: "foo"')).toBe(true);
    expect(isContractError("Enter a phone number we can reach you on")).toBe(false);
  });
});

describe("spikes", () => {
  it("counts the current and previous bucket as the last hour", () => {
    const w = hourlyWindow([bucket(0, 4), bucket(1, 3), bucket(2, 24), bucket(30, 100)], NOW, () => true);
    expect(w.lastHour).toBe(7);
    expect(w.baselinePerHour).toBe(1);
  });

  it("alarms on a server spike well above the norm", () => {
    expect(spikeCandidates([bucket(0, 30), bucket(5, 24)], NOW).map((c) => c.key)).toEqual(["spike:server"]);
  });

  it("does not alarm on a busy but normal hour", () => {
    const steady = Array.from({ length: 25 }, (_, h) => bucket(h, 10));
    expect(spikeCandidates(steady, NOW)).toEqual([]);
  });

  it("needs a floor, so three errors after a silent day is not a spike", () => {
    expect(spikeCandidates([bucket(0, 3)], NOW)).toEqual([]);
  });

  it("keeps browser reports separate from server errors", () => {
    const out = spikeCandidates([bucket(0, 40, { category: "client_4xx", level: "warn" })], NOW);
    expect(out.map((c) => c.key)).toEqual(["spike:client"]);
  });

  it("alarms when Paystack webhooks keep failing their signature", () => {
    const out = spikeCandidates([bucket(0, 6, { category: "payment", level: "warn" })], NOW);
    expect(out.map((c) => c.key)).toEqual(["spike:payment-webhook"]);
  });
});

describe("notificationCandidates", () => {
  it("alarms when a real share of the hour's notifications failed", () => {
    expect(notificationCandidates({ failedLastHour: 6, sentLastHour: 10 })).toHaveLength(1);
  });

  it("does not alarm on one bounce in a busy hour", () => {
    expect(notificationCandidates({ failedLastHour: 6, sentLastHour: 200 })).toEqual([]);
    expect(notificationCandidates({ failedLastHour: 2, sentLastHour: 0 })).toEqual([]);
  });
});

describe("opsSnapshotCandidates", () => {
  it("takes the Health screen's critical alarms and repeated job failures, not the error tally", () => {
    const out = opsSnapshotCandidates([
      { key: "job-stale:reconcile-payments", level: "critical", title: "Payment reconciliation is stale", detail: "d" },
      { key: "job-failing:catalog-scrape", level: "warning", title: "Catalogue scrape failing repeatedly", detail: "d" },
      { key: "errors-new", level: "critical", title: "2 new errors today", detail: "d" },
      { key: "extraction-stuck", level: "warning", title: "1 paste job stuck", detail: "d" },
      { key: "orders-unpaid", level: "info", title: "x", detail: "d" },
    ]);
    expect(out.map((c) => c.key)).toEqual(["ops:job-stale:reconcile-payments", "ops:job-failing:catalog-scrape"]);
  });
});

describe("selectAlertsToSend", () => {
  const a: AlertCandidate = { key: "error:a", level: "warning", title: "A", detail: "" };
  const b: AlertCandidate = { key: "error:b", level: "critical", title: "B", detail: "" };

  it("sends everything due in one email, critical first", () => {
    const out = selectAlertsToSend([a, b], [], 0, NOW);
    expect(out.send.map((c) => c.key)).toEqual(["error:b", "error:a"]);
  });

  it("does not send the same key twice within the hour", () => {
    const out = selectAlertsToSend([a, b], [{ alert_key: "error:a", last_sent_at: ago(30) }], 0, NOW);
    expect(out.send.map((c) => c.key)).toEqual(["error:b"]);
    expect(out.throttled).toBe(1);
  });

  it("sends it again once the hour has passed", () => {
    expect(selectAlertsToSend([a], [{ alert_key: "error:a", last_sent_at: ago(61) }], 0, NOW).send).toHaveLength(1);
  });

  it("holds everything back at the hourly cap, un-stamped, for the next allowed run", () => {
    const out = selectAlertsToSend([a, b], [], ALERT_RULES.maxAlertEmailsPerHour, NOW);
    expect(out.send).toEqual([]);
    expect(out.held).toHaveLength(2);
  });

  it("de-duplicates candidates that two rules produced", () => {
    expect(selectAlertsToSend([a, a], [], 0, NOW).send).toHaveLength(1);
  });
});

describe("alertSubject", () => {
  it("names a single alert and counts a digest", () => {
    expect(alertSubject([{ key: "k", level: "critical", title: "New payment error", detail: "" }], null)).toBe("[Tomame] New payment error");
    expect(alertSubject([
      { key: "k", level: "critical", title: "x", detail: "" },
      { key: "j", level: "warning", title: "y", detail: "" },
    ], "dev")).toBe("[Tomame dev] 2 platform alerts (1 critical)");
  });
});
