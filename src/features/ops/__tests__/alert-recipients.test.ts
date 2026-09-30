import { describe, expect, it } from "vitest";

import { alertsEnabled, environmentLabel, parseRecipients, resolveRecipients } from "@/features/ops/alert-recipients";

describe("recipients", () => {
  it("reads the setting, cleaning and de-duplicating it", () => {
    expect(parseRecipients([" Ops@Example.com", "ops@example.com", "not an email", 42])).toEqual(["ops@example.com"]);
  });

  it("lets the environment override the setting", () => {
    expect(resolveRecipients("a@x.com, b@y.com", ["kelanimdev@gmail.com"])).toEqual({ recipients: ["a@x.com", "b@y.com"], from: "env" });
  });

  it("falls back to the owner's address rather than to nobody", () => {
    expect(resolveRecipients(undefined, null)).toEqual({ recipients: ["kelanimdev@gmail.com"], from: "default" });
    expect(resolveRecipients("", [])).toMatchObject({ from: "default" });
  });
});

describe("which deployment sends", () => {
  it("production on tomame.ca sends", () => {
    expect(alertsEnabled({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://tomame.ca" })).toBe(true);
    expect(environmentLabel({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://tomame.ca" })).toBeNull();
  });

  it("the dev project builds as production too, and does not send", () => {
    const dev = { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://dev.tomame.ca" };
    expect(alertsEnabled(dev)).toBe(false);
    expect(environmentLabel(dev)).toBe("dev");
  });

  it("an explicit switch wins either way", () => {
    expect(alertsEnabled({ OPS_ALERTS_ENABLED: "true" })).toBe(true);
    expect(alertsEnabled({ OPS_ALERTS_ENABLED: "false", VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://tomame.ca" })).toBe(false);
    expect(environmentLabel({})).toBe("local");
  });
});

describe("production is the tomame.ca address, with or without VERCEL_ENV (prod bug 2026-09-30)", () => {
  it("sends on tomame.ca even though Vercel's system variables are not exposed", () => {
    const env = { NEXT_PUBLIC_APP_URL: "https://tomame.ca", NODE_ENV: "production" };
    expect(alertsEnabled(env)).toBe(true);
    expect(environmentLabel(env)).toBeNull();
  });
  it("does not send from dev or from a laptop", () => {
    expect(alertsEnabled({ NEXT_PUBLIC_APP_URL: "https://dev.tomame.ca", NODE_ENV: "production" })).toBe(false);
    expect(environmentLabel({ NEXT_PUBLIC_APP_URL: "https://dev.tomame.ca", NODE_ENV: "production" })).toBe("dev");
    expect(alertsEnabled({ NEXT_PUBLIC_APP_URL: "https://tomame.ca", NODE_ENV: "development" })).toBe(false);
  });
});
