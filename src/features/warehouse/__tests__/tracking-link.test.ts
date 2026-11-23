import { describe, expect, it } from "vitest";

import { isShortLink, readStoreLink, readTrackingEntries, readTrackingEntry, trackingFromLink } from "../inbound/tracking-link";

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

describe("store tracking links with no number (141)", () => {
  const share = "https://a.co/d/0c8Ijdes";

  it("keeps Amazon's Share tracking link instead of refusing it", () => {
    expect(readTrackingEntry(share)).toEqual({ input: share, number: "", link: share, problem: null });
    expect(readTrackingEntry("https://www.amazon.com/progress-tracker/package/share/?unauthenticated=1&shareToken=abc").problem).toBeNull();
  });

  it("reads the same link pasted twice as one link (TM-00037, TM-00038)", () => {
    const [entry] = readTrackingEntries(`${share} ${share}`);
    expect(entry).toMatchObject({ link: share, problem: null });
  });

  it("names two different links in one box", () => {
    expect(readStoreLink(`${share} https://a.co/d/other123`)?.problem).toMatch(/comma/);
  });

  it("upgrades http and bare www links to https", () => {
    expect(readStoreLink("http://a.co/d/0c8Ijdes")?.url).toBe(share);
    expect(readStoreLink("www.example-store.com/track/abc")?.url).toBe("https://www.example-store.com/track/abc");
  });

  it("refuses product pages and pages only our account can open", () => {
    expect(readTrackingEntry("https://www.amazon.com/dp/B0CHX1W1XY").problem).toMatch(/product page/);
    expect(readTrackingEntry("https://www.ebay.com/itm/123456789012").problem).toMatch(/product page/);
    expect(readTrackingEntry("https://www.amazon.com/progress-tracker/package/ref=ppx?orderId=112-4471239-0081234").problem).toMatch(/Only our store account/);
  });

  it("still turns a carrier link into its number, and leaves numbers alone", () => {
    expect(readTrackingEntry("https://www.ups.com/track?tracknum=1Z999AA10123456784")).toMatchObject({ number: "1Z999AA10123456784", link: null, problem: null });
    expect(readTrackingEntry("TBA312488901102")).toMatchObject({ number: "TBA312488901102", link: null, problem: null });
    expect(readTrackingEntry("TBA312488901102 https://a.co/d/x").link).toBeNull();
  });

  it("knows the store short-link hosts", () => {
    expect(isShortLink(share)).toBe(true);
    expect(isShortLink("https://amzn.to/3abc")).toBe(true);
    expect(isShortLink("https://www.ups.com/track")).toBe(false);
  });
});
