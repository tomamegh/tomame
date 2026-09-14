import { describe, expect, it } from "vitest";

import { buildCsp } from "../csp";

describe("buildCsp", () => {
  const base = { supabaseOrigin: "https://project.supabase.co", isProd: false };

  it("allows only same-origin and inline scripts, never a third-party host", () => {
    const csp = buildCsp(base);
    expect(csp).toContain(`script-src 'self' 'unsafe-inline'`);
    expect(csp).not.toContain("strict-dynamic");
    // The nonce scheme took prerendered pages down in production: the HTML's
    // baked-in nonce cannot match a per-request one. See csp.ts.
    expect(csp).not.toContain("nonce-");
  });

  it("scopes connect-src to self plus exactly the given Supabase origin", () => {
    const csp = buildCsp(base);
    const connectSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toBe("connect-src 'self' https://project.supabase.co");
  });

  it("closes framing outright", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src 'none'");
  });

  it("keeps img-src wide open for arbitrary product photo hosts", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("img-src 'self' data: blob: https:");
  });

  it("only adds upgrade-insecure-requests in production", () => {
    expect(buildCsp({ ...base, isProd: false })).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ ...base, isProd: true })).toContain("upgrade-insecure-requests");
  });

  it("only allows 'unsafe-eval' (React dev debugging) outside production", () => {
    expect(buildCsp({ ...base, isProd: false })).toContain("'unsafe-eval'");
    expect(buildCsp({ ...base, isProd: true })).not.toContain("'unsafe-eval'");
  });

  it("uses a different origin when given a local Supabase URL", () => {
    const csp = buildCsp({ ...base, supabaseOrigin: "http://127.0.0.1:54321" });
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:54321");
  });
});
