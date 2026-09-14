import { describe, expect, it } from "vitest";

import { PRICE_WATCH_JOB } from "@/config/security";

import {
  failureLabel,
  failuresRemaining,
  jobHealth,
  jobHealthMessage,
  unmeteredSpendNote,
  watchHealth,
  watchHealthBadge,
} from "../components/admin-watch-format";

const NOW = new Date("2026-09-13T12:00:00Z");

describe("watchHealth", () => {
  it("separates a job retirement from a customer stopping the watch", () => {
    // `is_active = false` means both things; the failure counter is the only
    // thing that tells them apart.
    expect(
      watchHealth({ is_active: false, consecutive_failures: 5, last_checked_at: "x" }),
    ).toBe("retired");
    expect(
      watchHealth({ is_active: false, consecutive_failures: 0, last_checked_at: "x" }),
    ).toBe("stopped");
  });

  it("flags an active watch with failures behind it", () => {
    expect(
      watchHealth({ is_active: true, consecutive_failures: 2, last_checked_at: "x" }),
    ).toBe("failing");
  });

  it("calls an active, never-checked watch out separately from a healthy one", () => {
    expect(
      watchHealth({ is_active: true, consecutive_failures: 0, last_checked_at: null }),
    ).toBe("unchecked");
    expect(
      watchHealth({ is_active: true, consecutive_failures: 0, last_checked_at: "x" }),
    ).toBe("healthy");
  });
});

describe("watchHealthBadge", () => {
  it("keeps amber for the states a person still has to look at", () => {
    expect(watchHealthBadge("failing").tone).toBe("amber");
    expect(watchHealthBadge("unchecked").tone).toBe("amber");
    expect(watchHealthBadge("healthy").tone).toBe("green");
    expect(watchHealthBadge("retired").tone).toBe("coral");
    expect(watchHealthBadge("stopped").tone).toBe("muted");
  });
});

describe("failuresRemaining / failureLabel", () => {
  it("counts down to the retirement ceiling rather than reporting a bare tally", () => {
    expect(failuresRemaining(1)).toBe(PRICE_WATCH_JOB.maxConsecutiveFailures - 1);
    expect(failuresRemaining(PRICE_WATCH_JOB.maxConsecutiveFailures)).toBe(0);
    // Never negative, even if the job overshoots the ceiling.
    expect(failuresRemaining(PRICE_WATCH_JOB.maxConsecutiveFailures + 3)).toBe(0);
  });

  it("says nothing when there is nothing wrong", () => {
    expect(failureLabel(0)).toBeNull();
  });

  it("says retired once the ceiling is reached", () => {
    expect(failureLabel(PRICE_WATCH_JOB.maxConsecutiveFailures)).toContain("Retired after");
  });

  it("uses the singular for one failure", () => {
    expect(failureLabel(1)).toContain("1 failed check,");
  });
});

describe("jobHealth", () => {
  it("calls an empty platform idle rather than broken", () => {
    // No active watches means nothing is due; a job that did nothing did the
    // right thing.
    expect(jobHealth({ activeWatches: 0, lastCheckedAt: null, now: NOW })).toBe("idle");
  });

  it("does not call a quiet job broken inside its own recheck window", () => {
    // Runs fire every ten minutes but only claim watches older than
    // recheckAfterHours, so silence for a few hours is normal.
    const recent = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(jobHealth({ activeWatches: 5, lastCheckedAt: recent, now: NOW })).toBe("running");
  });

  it("reports silence past a full window plus slack", () => {
    const stale = new Date(
      NOW.getTime() - (PRICE_WATCH_JOB.recheckAfterHours + 2) * 60 * 60 * 1000,
    ).toISOString();
    expect(jobHealth({ activeWatches: 5, lastCheckedAt: stale, now: NOW })).toBe("silent");
  });

  it("distinguishes never-run from silent", () => {
    expect(jobHealth({ activeWatches: 5, lastCheckedAt: null, now: NOW })).toBe("never_run");
    expect(jobHealth({ activeWatches: 5, lastCheckedAt: "junk", now: NOW })).toBe("never_run");
  });
});

describe("jobHealthMessage", () => {
  it("names the usual cause when the job has gone silent", () => {
    // Migration 052's function warns and returns when the vault secret is
    // unset, which installs cleanly and then never calls the app.
    const message = jobHealthMessage("silent");
    expect(message.tone).toBe("coral");
    expect(message.body).toContain("app_url");
  });

  it("does not colour an idle platform as a problem", () => {
    expect(jobHealthMessage("idle").tone).toBe("muted");
  });
});

describe("unmeteredSpendNote", () => {
  it("never presents price-watch spend as a metered zero", () => {
    // job_budgets meters catalog-scrape only (045); printing 0 spent against a
    // cap would claim a ceiling that does not exist for this job.
    expect(unmeteredSpendNote(0)).toContain("not metered in job_budgets");
    expect(unmeteredSpendNote(120)).toContain("not metered in job_budgets");
  });

  it("reports the real count of successful checks", () => {
    expect(unmeteredSpendNote(1234)).toContain("1,234 successful checks");
  });
});
