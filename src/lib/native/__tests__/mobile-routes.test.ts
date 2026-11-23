import { describe, expect, it } from "vitest";

import { isAppUserAgent, mobilePathFor } from "../mobile-routes";

const map = (url: string) => {
  const u = new URL(url, "https://tomame.ca");
  return mobilePathFor(u.pathname, u.searchParams);
};
const ORDER = "6f1c2a1e-3b4d-4c5e-8f90-1a2b3c4d5e6f";

describe("mobilePathFor", () => {
  it("maps the app's home, bag, watch, account and chat", () => {
    expect(map("/app")).toBe("/m");
    expect(map("/app/")).toBe("/m");
    expect(map("/app/bag?payment=failed")).toBe("/m/bag?payment=failed");
    expect(map("/app/watches")).toBe("/m/watch");
    expect(map("/app/account")).toBe("/m/account");
    expect(map("/app/find")).toBe("/m/chat");
    expect(map(`/app/find/chat/${ORDER}`)).toBe(`/m/chat/${ORDER}`);
  });

  it("lands a settled payment on the Paid screen with its group", () => {
    expect(map(`/app/orders?payment=success&group=${ORDER}`)).toBe(`/m/paid?group=${ORDER}`);
    expect(map("/app/orders?payment=success")).toBe("/m/paid");
    expect(map("/app/orders")).toBe("/m/orders");
  });

  it("sends a quote to the product screen and an order to its tracker", () => {
    expect(map(`/app/orders/review/${ORDER}?quantity=2`)).toBe(`/m/product/${ORDER}`);
    expect(map(`/app/orders/${ORDER}`)).toBe(`/m/orders/${ORDER}`);
  });

  it("keeps sign-in's next when it moves to the app's welcome", () => {
    expect(map("/auth/login?next=%2Fm%2Fbag")).toBe("/m/welcome?next=%2Fm%2Fbag");
  });

  it("leaves pages the app has no screen for alone", () => {
    expect(map("/app/orders/new?url=https%3A%2F%2Famazon.com")).toBeNull();
    expect(map("/app/orders/not-a-uuid")).toBeNull();
    expect(map("/app/cars")).toBeNull();
    expect(map("/app/account?tab=addresses")).toBeNull();
    expect(map("/track")).toBeNull();
    expect(map("/m/bag")).toBeNull();
  });
});

describe("isAppUserAgent", () => {
  it("recognises the shell's user agent only", () => {
    expect(isAppUserAgent("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 TomameIOS")).toBe(true);
    expect(isAppUserAgent("Mozilla/5.0 (iPhone) Safari/604.1")).toBe(false);
    expect(isAppUserAgent(null)).toBe(false);
  });
});
