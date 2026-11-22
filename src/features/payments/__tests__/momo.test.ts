import { describe, expect, it } from "vitest";
import { formatLocalGhanaPhone, inferMomoProvider, toLocalGhanaPhone } from "../momo";

describe("inferMomoProvider", () => {
  it.each([
    ["+233551234987", "mtn"],
    ["+233244123456", "mtn"],
    ["+233201234567", "vod"],
    ["+233501234567", "vod"],
    ["+233261234567", "atl"],
    ["+233571234567", "atl"],
  ])("%s → %s", (phone, provider) => {
    expect(inferMomoProvider(phone)).toBe(provider);
  });

  it("is null for an unknown prefix, a non-Ghana number or nothing", () => {
    expect(inferMomoProvider("+233311234567")).toBeNull();
    expect(inferMomoProvider("+14155550100")).toBeNull();
    expect(inferMomoProvider(null)).toBeNull();
  });
});

describe("Ghana phone display", () => {
  it("turns E.164 into the local form Paystack charges and people read", () => {
    expect(toLocalGhanaPhone("+233551234987")).toBe("0551234987");
    expect(formatLocalGhanaPhone("+233551234987")).toBe("055 123 4987");
  });
});
