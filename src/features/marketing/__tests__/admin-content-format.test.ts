import { describe, expect, it } from "vitest";

import {
  feeChangeWarning,
  isFeeChange,
  parseSettingInput,
  regionStatusBadge,
  regionStatusHelp,
  settingShape,
  settingToEditorValue,
  settingVisibility,
  settingWarning,
  transitWindowLabel,
} from "../components/admin-content-format";

describe("settingShape / settingToEditorValue", () => {
  it("treats a JSON string as text and everything else as JSON", () => {
    expect(settingShape("+233 59 442 4746")).toBe("text");
    expect(settingShape([{ id: "card" }])).toBe("json");
    expect(settingShape({ subject: "…" })).toBe("json");
    expect(settingShape(42)).toBe("json");
  });

  it("shows a string unquoted and an object pretty-printed", () => {
    expect(settingToEditorValue("Accra, Ghana")).toBe("Accra, Ghana");
    expect(settingToEditorValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("parseSettingInput", () => {
  it("stores text verbatim so punctuation cannot break it", () => {
    // "Accra, Ghana" is not valid JSON; sending it through JSON.parse would
    // make an unquoted comma a syntax error on a plain address field.
    expect(parseSettingInput("text", "Accra, Ghana")).toEqual({
      ok: true,
      value: "Accra, Ghana",
    });
  });

  it("parses JSON settings", () => {
    expect(parseSettingInput("json", '[{"id":"card"}]')).toEqual({
      ok: true,
      value: [{ id: "card" }],
    });
  });

  it("reports a JSON error instead of silently writing a string", () => {
    const result = parseSettingInput("json", "[{id: card}]");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("settingWarning", () => {
  it("warns about payment_channels and names the field the bag needs", () => {
    // 048 gave each channel a paystack_channel; losing it takes the channel off
    // checkout while the footer keeps rendering its label.
    expect(settingWarning("payment_channels")).toContain("paystack_channel");
  });

  it("says nothing for an ordinary key", () => {
    expect(settingWarning("support_hours")).toBeNull();
  });
});

describe("settingVisibility", () => {
  it("distinguishes a key visitors can read from one they cannot", () => {
    expect(settingVisibility(true).label).toBe("Public");
    expect(settingVisibility(false).label).toBe("Private");
  });
});

describe("regionStatusBadge / regionStatusHelp", () => {
  it("gives amber only to the lane that is waiting on us", () => {
    expect(regionStatusBadge("live").tone).toBe("green");
    expect(regionStatusBadge("soon").tone).toBe("amber");
    expect(regionStatusBadge("off").tone).toBe("muted");
  });

  it("explains what each status does to the storefront", () => {
    expect(regionStatusHelp("live")).toContain("buy");
    expect(regionStatusHelp("soon")).toContain("waitlist");
    expect(regionStatusHelp("off")).toContain("hidden");
  });
});

describe("transitWindowLabel", () => {
  it("renders a window, a floor, a ceiling, or nothing", () => {
    expect(transitWindowLabel(7, 14)).toBe("7–14 days");
    expect(transitWindowLabel(7, null)).toBe("from 7 days");
    expect(transitWindowLabel(null, 14)).toBe("up to 14 days");
    expect(transitWindowLabel(null, null)).toBeNull();
  });
});

describe("delivery zone fees", () => {
  it("treats any change at all as a money change", () => {
    // No threshold: the mistake being guarded against is a typo, and a typo has
    // no size.
    expect(isFeeChange(0, 0.5)).toBe(true);
    expect(isFeeChange(40, 40)).toBe(false);
  });

  it("names both figures in the confirmation", () => {
    const warning = feeChangeWarning("Kumasi door", 40, 60);
    expect(warning).toContain("GH₵60.00");
    expect(warning).toContain("GH₵40.00");
    expect(warning).toContain("more");
  });

  it("says less when the fee drops", () => {
    expect(feeChangeWarning("Accra door", 40, 10)).toContain("less");
  });
});
