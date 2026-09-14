import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/job-heartbeats", () => ({ recordJobRun: vi.fn(async () => undefined) }));

import { authorizeCron, runCronJob } from "@/lib/auth/cron";
import { recordJobRun } from "@/db/queries/job-heartbeats";

const req = (auth?: string) =>
  new NextRequest("https://tomame.test/api/cron/x", { headers: auth ? { authorization: auth } : {} });

const original = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
});
afterEach(() => {
  process.env.CRON_SECRET = original;
});

describe("authorizeCron", () => {
  it("fails CLOSED when the secret is not configured", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(req("Bearer anything"), "x")?.status).toBe(503);
  });
  it("refuses a missing or wrong bearer", () => {
    expect(authorizeCron(req(), "x")?.status).toBe(401);
    expect(authorizeCron(req("Bearer nope"), "x")?.status).toBe(401);
  });
  it("admits the right bearer", () => {
    expect(authorizeCron(req("Bearer s3cret"), "x")).toBeNull();
  });
});

describe("runCronJob", () => {
  it("records a successful heartbeat with the summary and answers 200", async () => {
    const res = await runCronJob(req("Bearer s3cret"), "demo", async () => ({ done: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, done: 2 });
    expect(recordJobRun).toHaveBeenCalledWith("demo", expect.objectContaining({ ok: true, summary: { done: 2 } }));
  });

  it("treats success:false as a failed run and answers 207", async () => {
    const res = await runCronJob(req("Bearer s3cret"), "demo", async () => ({ success: false, message: "partial" }));
    expect(res.status).toBe(207);
    expect(recordJobRun).toHaveBeenCalledWith("demo", expect.objectContaining({ ok: false, error: "partial" }));
  });

  it("records a failed heartbeat and answers 500 when the handler throws", async () => {
    const res = await runCronJob(req("Bearer s3cret"), "demo", async () => { throw new Error("db down"); });
    expect(res.status).toBe(500);
    expect(recordJobRun).toHaveBeenCalledWith("demo", expect.objectContaining({ ok: false, error: "db down" }));
  });

  it("does not run the handler, or record anything, for an unauthorized caller", async () => {
    const handler = vi.fn(async () => ({}));
    const res = await runCronJob(req("Bearer wrong"), "demo", handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(recordJobRun).not.toHaveBeenCalled();
  });

  it("still answers the job's result when the heartbeat write fails", async () => {
    vi.mocked(recordJobRun).mockRejectedValueOnce(new Error("no table"));
    const res = await runCronJob(req("Bearer s3cret"), "demo", async () => ({ ok: 1 }));
    expect(res.status).toBe(200);
  });
});
