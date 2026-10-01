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
