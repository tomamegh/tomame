import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger/error-sink", () => ({ captureError: vi.fn() }));

import { recordClientError, toClientErrorEvent } from "@/features/ops/client-errors.service";
import { captureError } from "@/lib/logger/error-sink";

describe("toClientErrorEvent", () => {
  it("files the reported profile failure with route, status, message and the session's user", () => {
    const e = toClientErrorEvent(
      { kind: "api_4xx", api: "/api/app/me", method: "PATCH", status: 400, message: "Invalid input: expected string, received null", page: "/app/account" },
      { userId: "u-1", role: "user" },
    );
    expect(e).toMatchObject({
      level: "warn",
      category: "client_4xx",
      source: "client:4xx PATCH /api/app/me",
      message: "400 from PATCH /api/app/me: Invalid input: expected string, received null",
      context: { page: "/app/account", api: "/api/app/me", status: 400, userId: "u-1", role: "user" },
    });
  });

  it("groups by route, not by the id in it", () => {
    const viewer = { userId: null, role: null };
    const a = toClientErrorEvent({ kind: "api_4xx", api: "/api/orders/8d6677b3-8b78-4ed5-a384-d4e5b80606d0/feedback", status: 400, method: "POST", message: "x" }, viewer);
    const b = toClientErrorEvent({ kind: "api_4xx", api: "/api/orders/c8c504bf-81ed-411b-87f8-c75a5f7d33a0/feedback", status: 400, method: "POST", message: "x" }, viewer);
    expect(a.source).toBe(b.source);
  });

  it("files a crashed screen as an error", () => {
    expect(toClientErrorEvent({ kind: "render", message: "Cannot read x", page: "/app/bag", digest: "123" }, { userId: null, role: null })).toMatchObject({
      level: "error",
      category: "client_crash",
      source: "client:render /app/bag",
    });
  });

  it("hands the event to the sink, which never throws", () => {
    recordClientError({ kind: "window", message: "boom", page: "/app" }, { userId: null, role: null });
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ category: "client_crash", meta: expect.objectContaining({ source: "client:window /app" }) }));
  });
});
