import { describe, expect, it } from "vitest";

import { detectCarrier, formatTracking, normaliseTracking, trackingKey } from "../inbound/tracking-number";

describe("normaliseTracking (086)", () => {
  it("strips spaces, dashes and case", () => {
    const t = normaliseTracking(" 1z 999-aa1 0123 4567 84 ");
    expect(t?.key).toBe("1Z999AA10123456784");
    expect(t?.carrier).toBe("ups");
    expect(t?.candidates[0]).toBe("1Z999AA10123456784");
  });

  it("reads Amazon Logistics numbers", () => {
    expect(normaliseTracking("tba123456789012")).toMatchObject({ key: "TBA123456789012", carrier: "amazon" });
  });

  it("strips the USPS 420 + 5-digit ZIP routing prefix from a GS1 barcode", () => {
    const t = normaliseTracking("42010001" + "9400111899223197428490");
    expect(t?.key).toBe("9400111899223197428490");
    expect(t?.carrier).toBe("usps");
    // The raw scan is still a candidate, so a number registered with its prefix matches too.
    expect(t?.candidates).toContain("420100019400111899223197428490");
  });

  it("strips the USPS 420 + ZIP+4 prefix", () => {
    const t = normaliseTracking("420100011234" + "9400111899223197428490");
    expect(t?.key).toBe("9400111899223197428490");
  });

  it("drops the FNC1 separator and the symbology identifier a scanner sends", () => {
    const t = normaliseTracking("]C1420" + "10001\x1d" + "9400111899223197428490");
    expect(t?.key).toBe("9400111899223197428490");
  });

  it("takes the tracking number from the tail of a FedEx 34-digit barcode", () => {
    const barcode = "9622001900000000000" + "000" + "123456789012";
    expect(barcode).toHaveLength(34);
    const t = normaliseTracking(barcode);
    expect(t?.key).toBe("123456789012");
    expect(t?.carrier).toBe("fedex");
    expect(t?.candidates).toContain(barcode);
  });

  it("refuses what cannot be a tracking number", () => {
    expect(normaliseTracking("")).toBeNull();
    expect(normaliseTracking("abc12")).toBeNull();
    expect(normaliseTracking("TM-00042")).toBeNull();
    expect(normaliseTracking("x".repeat(70))).toBeNull();
  });

  it("matches the database's tracking_key()", () => {
    expect(trackingKey("ab-12 cd.34")).toBe("AB12CD34");
  });

  it("guesses carriers from the shape alone", () => {
    expect(detectCarrier("1Z999AA10123456784")).toBe("ups");
    expect(detectCarrier("9400111899223197428490")).toBe("usps");
    expect(detectCarrier("EA123456789US")).toBe("usps");
    expect(detectCarrier("123456789012")).toBe("fedex");
    expect(detectCarrier("JJD0099999999")).toBe("dhl");
    expect(detectCarrier("ZZZZ12345678")).toBe("other");
  });

  it("groups numbers for reading", () => {
    expect(formatTracking("1Z999AA10123456784")).toBe("1Z 999 AA1 01 2345 6784");
    expect(formatTracking("9400111899223197428490")).toBe("9400 1118 9922 3197 4284 90");
  });
});

describe("trackingInputProblem: what an admin typed", () => {
  it("accepts real carrier numbers", async () => {
    const { trackingInputProblem } = await import("../inbound/tracking-number");
    for (const t of ["1Z999AA10123456784", "TBA312345678901", "9400 1000 0000 0000 0000 00", "772899172645"]) expect(trackingInputProblem(t), t).toBeNull();
  });

  it("explains a link, an Amazon order number and a double paste (TM-00037)", async () => {
    const { trackingInputProblem } = await import("../inbound/tracking-number");
    expect(trackingInputProblem("https://a.co/d/0iXDFAEI")).toMatch(/link/);
    expect(trackingInputProblem("a.co/d/0iXDFAEI")).toMatch(/link/);
    expect(trackingInputProblem("https://a.co/d/0iXDFAEIhttps://a.co/d/0iXDFAEI")).toMatch(/link/);
    expect(trackingInputProblem("www.amazon.com/progress-tracker/package")).toMatch(/link/);
    expect(trackingInputProblem("114-3902157-0071425")).toMatch(/Amazon order number/);
    expect(trackingInputProblem("HTTPSACOD0IXDFAEIHTTPSACOD0IXDFAEI")).toMatch(/twice/);
    expect(trackingInputProblem("1Z999AA101234567841Z999AA10123456784")).toMatch(/twice/);
    expect(trackingInputProblem("abc")).toMatch(/does not look like/);
  });
});

describe("Delta Cargo air waybills (113, Fix 12)", () => {
  it("normalises the 11 digits, or the 8-digit serial, to 006-XXXXXXXX", async () => {
    const { normaliseDeltaAwb } = await import("../inbound/tracking-number");
    expect(normaliseDeltaAwb("006-12345675")).toBe("006-12345675");
    expect(normaliseDeltaAwb("006 1234 5675")).toBe("006-12345675");
    expect(normaliseDeltaAwb("12345675")).toBe("006-12345675");
  });

  it("explains every refusal", async () => {
    const { awbInputProblem } = await import("../inbound/tracking-number");
    expect(awbInputProblem("https://www.deltacargo.com/x")).toMatch(/link/);
    expect(awbInputProblem("HTTPSACOD0IXDFAEIHTTPSACOD0IXDFAEI")).toBeTruthy();
    expect(awbInputProblem("0061234567500612345675")).toMatch(/twice/);
    expect(awbInputProblem("01612345675")).toMatch(/start with 006/);
    expect(awbInputProblem("006-12345676")).toMatch(/check digit/);
    expect(awbInputProblem("006-12345675")).toBeNull();
  });

  it("links each carrier to its own tracking page", async () => {
    const { carrierTrackingUrl } = await import("../inbound/tracking-number");
    expect(carrierTrackingUrl("ups", "1ZE3500B0334960616")).toContain("ups.com");
    expect(carrierTrackingUrl("delta", "006-12345675")).toContain("deltacargo.com");
    expect(carrierTrackingUrl("other", "X")).toBeNull();
  });
});
