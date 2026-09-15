import { describe, expect, it } from "vitest";

import {
  INSTALL_DISMISSAL_DAYS,
  INSTALL_DISMISSED_FOREVER,
  isDismissalActive,
  isIosInstallCapable,
  isMobileInstallContext,
  isPromptableRoute,
  isStandalone,
} from "../lib/install-state";

const DAY = 24 * 60 * 60 * 1000;

function fakeWindow(options: {
  matches?: string[];
  iosStandalone?: boolean;
}): Window {
  return {
    matchMedia: (query: string) => ({
      matches: (options.matches ?? []).some((mode) => query.includes(mode)),
    }),
    navigator: { standalone: options.iosStandalone },
  } as unknown as Window;
}

describe("isStandalone", () => {
  it("is false in an ordinary browser tab", () => {
    expect(isStandalone(fakeWindow({ matches: ["browser"] }))).toBe(false);
  });

  it("detects an installed app by display-mode", () => {
    expect(isStandalone(fakeWindow({ matches: ["standalone"] }))).toBe(true);
    expect(isStandalone(fakeWindow({ matches: ["minimal-ui"] }))).toBe(true);
  });

  it("does NOT treat a fullscreen browser tab as an installed app", () => {
    // Regression: `fullscreen` was in the detector, and an ordinary window put
    // fullscreen by the macOS green button or F11 matches it. That made
    // tomame.ca redirect a desktop visitor off the marketing site into /app,
    // and from there to a login screen — the marketing site simply vanished
    // for anyone browsing fullscreen.
    expect(isStandalone(fakeWindow({ matches: ["fullscreen"] }))).toBe(false);
    expect(isStandalone(fakeWindow({ matches: ["browser", "fullscreen"] }))).toBe(false);
  });

  it("detects iOS, which reports navigator.standalone and not the media query", () => {
    expect(isStandalone(fakeWindow({ iosStandalone: true }))).toBe(true);
  });

  it("is false when there is no window at all (server render)", () => {
    expect(isStandalone(undefined)).toBe(false);
  });
});

describe("isIosInstallCapable", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const iPadOs =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const android =
    "Mozilla/5.0 (Linux; Android 13; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
  const mac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

  it("recognises an iPhone", () => {
    expect(isIosInstallCapable(iphone, 5)).toBe(true);
  });

  it("recognises modern iPadOS, which claims to be a Mac", () => {
    expect(isIosInstallCapable(iPadOs, 5)).toBe(true);
  });

  it("does not mistake a desktop Mac for an iPad", () => {
    expect(isIosInstallCapable(mac, 0)).toBe(false);
  });

  it("leaves Android to the real beforeinstallprompt event", () => {
    expect(isIosInstallCapable(android, 5)).toBe(false);
  });
});

describe("isDismissalActive", () => {
  const now = 1_700_000_000_000;

  it("does not silence a prompt nobody has dismissed", () => {
    expect(isDismissalActive(null, now)).toBe(false);
  });

  it("silences it for the dismissal window", () => {
    expect(isDismissalActive(String(now - 3 * DAY), now)).toBe(true);
  });

  it("lets it return once the window has passed", () => {
    expect(isDismissalActive(String(now - (INSTALL_DISMISSAL_DAYS + 1) * DAY), now)).toBe(false);
  });

  it("silences it permanently once installed", () => {
    expect(isDismissalActive(INSTALL_DISMISSED_FOREVER, now)).toBe(true);
  });

  it("treats a corrupt value as never dismissed rather than dismissed forever", () => {
    expect(isDismissalActive("not-a-number", now)).toBe(false);
    expect(isDismissalActive("-1", now)).toBe(false);
  });

  it("honours a future timestamp instead of prompting every launch on a wound-back clock", () => {
    expect(isDismissalActive(String(now + DAY), now)).toBe(true);
  });
});

describe("isMobileInstallContext", () => {
  function win(queries: Record<string, boolean>): Window {
    return {
      matchMedia: (query: string) => ({ matches: queries[query] ?? false }),
    } as unknown as Window;
  }

  const COARSE = "(pointer: coarse)";
  const NARROW = "(max-width: 1024px)";

  it("offers the install on a phone", () => {
    expect(isMobileInstallContext(win({ [COARSE]: true, [NARROW]: true }))).toBe(true);
  });

  it("does not offer it on a desktop browser squeezed narrow", () => {
    expect(isMobileInstallContext(win({ [COARSE]: false, [NARROW]: true }))).toBe(false);
  });

  it("does not offer it on a wide touchscreen laptop", () => {
    expect(isMobileInstallContext(win({ [COARSE]: true, [NARROW]: false }))).toBe(false);
  });

  it("is false during a server render", () => {
    expect(isMobileInstallContext(undefined)).toBe(false);
  });
});

describe("isPromptableRoute", () => {
  it("allows the marketing pages, which are where visitors are asked", () => {
    expect(isPromptableRoute("/")).toBe(true);
    expect(isPromptableRoute("/faq")).toBe(true);
    expect(isPromptableRoute("/where-we-buy")).toBe(true);
  });

  it("allows the everyday app screens", () => {
    expect(isPromptableRoute("/app")).toBe(true);
    expect(isPromptableRoute("/app/orders")).toBe(true);
    expect(isPromptableRoute("/app/products")).toBe(true);
  });

  it("stays out of the way while signing in, reviewing or paying", () => {
    expect(isPromptableRoute("/auth/login")).toBe(false);
    expect(isPromptableRoute("/app/bag")).toBe(false);
    expect(isPromptableRoute("/app/orders/review/abc-123")).toBe(false);
  });

  it("never appears in the admin console", () => {
    expect(isPromptableRoute("/admin/orders")).toBe(false);
  });
});
