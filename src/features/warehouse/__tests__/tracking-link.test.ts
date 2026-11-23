import { describe, expect, it } from "vitest";

import { readTrackingEntries, trackingFromLink } from "../inbound/tracking-link";

describe("trackingFromLink", () => {
  it("pulls the number out of carrier links", () => {
    expect(trackingFromLink("https://www.ups.com/track?loc=en_US&tracknum=1Z999AA10123456784")).toBe("1Z999AA10123456784");
    expect(trackingFromLink("https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490")).toBe("9400111899223197428490");
    expect(trackingFromLink("https://www.fedex.com/fedextrack/?trknbr=771234567890")).toBe("771234567890");
    expect(trackingFromLink("https://www.dhl.com/us-en/home/tracking.html?tracking-id=1234567890")).toBe("1234567890");
  });

  it("reads a number in the path", () => {
    expect(trackingFromLink("https://www.ups.com/track/1Z999AA10123456784")).toBe("1Z999AA10123456784");
  });

  it("returns null for plain numbers and links without one", () => {
    expect(trackingFromLink("1Z999AA10123456784")).toBeNull();
    expect(trackingFromLink("https://www.amazon.com/progress-tracker/package/ref=ppx?orderId=112-4471239-0081234")).toBeNull();
  });
});

describe("readTrackingEntries", () => {
  it("splits, converts links and names what it cannot read", () => {
    const out = readTrackingEntries("https://www.ups.com/track?tracknum=1Z999AA10123456784, TBA312488901102\n123");
    expect(out.map((e) => e.number)).toEqual(["1Z999AA10123456784", "TBA312488901102", "123"]);
    expect(out[0]!.problem).toBeNull();
    expect(out[1]!.problem).toBeNull();
    expect(out[2]!.problem).not.toBeNull();
  });

  it("still refuses a link it cannot read, in the validator's words", () => {
    const [entry] = readTrackingEntries("https://www.amazon.com/gp/your-account/order-details?orderID=112-4471239-0081234");
    expect(entry!.problem).toMatch(/link/);
  });
});
