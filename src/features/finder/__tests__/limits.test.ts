import { describe, expect, it } from "vitest";

import { RATE_LIMIT } from "@/config/security";
import { extractionDayLimit, finderChatDayLimit, visitorTasteLimits } from "../admission";

describe("assistant limits (abuse, 2026-11-23)", () => {
  it("caps a day of messages for everyone, tighter for a visitor", () => {
    expect(finderChatDayLimit("user:u1", true).config).toBe(RATE_LIMIT.finderChatUserDay);
    expect(finderChatDayLimit("s:abc").config).toBe(RATE_LIMIT.finderChatVisitorDay);
    expect(RATE_LIMIT.finderChatVisitorDay.maxRequests).toBeLessThan(RATE_LIMIT.finderChatUserDay.maxRequests);
  });

  it("caps a signed-in customer's fresh link reads per day", () => {
    expect(extractionDayLimit("user:u1")).toEqual({ key: "reads-day:user:u1", config: RATE_LIMIT.extractionUserDay });
  });

  it("gives a visitor a free taste per cookie, with a looser IP backstop", () => {
    const [cookie, ip] = visitorTasteLimits("sess-1", "ip:1.2.3.4");
    expect(cookie).toEqual({ key: "taste:s:sess-1", config: RATE_LIMIT.visitorTaste });
    expect(ip).toEqual({ key: "taste:ip:1.2.3.4", config: RATE_LIMIT.visitorTasteIp });
    expect(RATE_LIMIT.visitorTaste.maxRequests).toBe(3);
  });
});
