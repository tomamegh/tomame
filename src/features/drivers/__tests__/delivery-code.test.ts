import { describe, expect, it } from "vitest";

import { codesMatch, formatDeliveryCode, generateDeliveryCode, normaliseCodeInput } from "../delivery-code";

describe("delivery codes (102)", () => {
  it("are six digits, leading zeros kept", () => {
    for (let i = 0; i < 200; i++) expect(generateDeliveryCode()).toMatch(/^\d{6}$/);
  });

  it("read back however the driver typed them", () => {
    expect(normaliseCodeInput("482 913")).toBe("482913");
    expect(normaliseCodeInput("482-913")).toBe("482913");
    expect(normaliseCodeInput("48291")).toBeNull();
    expect(normaliseCodeInput("4829133")).toBeNull();
    expect(formatDeliveryCode("048291")).toBe("048 291");
  });

  it("compare exactly", () => {
    expect(codesMatch("048291", "048291")).toBe(true);
    expect(codesMatch("048291", "48291")).toBe(false);
    expect(codesMatch("048291", "048292")).toBe(false);
  });
});
