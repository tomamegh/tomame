import { describe, expect, it } from "vitest";

import { standaloneTarget } from "../components/standalone-app-router";

describe("standaloneTarget", () => {
  it("opens an installed Tomame on the app, wherever a link lands it", () => {
    expect(standaloneTarget("/", "")).toBe("/m");
    expect(standaloneTarget("/app", "")).toBe("/m");
    expect(standaloneTarget("/app/bag", "?payment=failed")).toBe("/m/bag?payment=failed");
    expect(standaloneTarget("/app/orders", "?payment=success&group=abc")).toBe("/m/paid?group=abc");
    expect(standaloneTarget("/auth/login", "?next=%2Fm")).toBe("/m/welcome?next=%2Fm");
    expect(standaloneTarget("/app/orders/new", "?mode=browse")).toBe("/m/shop");
  });

  it("leaves the app's own screens and pages it has no screen for", () => {
    expect(standaloneTarget("/m/bag", "")).toBeNull();
    expect(standaloneTarget("/track", "?q=TM-00038")).toBeNull();
    expect(standaloneTarget("/app/account", "?tab=addresses")).toBeNull();
  });
});
