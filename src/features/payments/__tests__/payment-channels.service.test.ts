import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/errors", () => ({
  isSchemaMissingError: (e: unknown) => /does not exist|PGRST205|42P01/i.test(e instanceof Error ? e.message : String(e)),
}));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));

import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { logger } from "@/lib/logger";
import { getBagPaymentSettings, getPaymentChannel, getPaymentHoldNote, listPaymentChannels } from "../services/payment-channels.service";

const SEEDED = [
  { id: "mtn_momo", label: "MTN MoMo", paystack_channel: "mobile_money", provider: "mtn", dot: "#FFCC00" },
  { id: "telecel_cash", label: "Telecel Cash", paystack_channel: "mobile_money", provider: "vod", dot: "#E60000" },
  { id: "at_money", label: "AT Money", paystack_channel: "mobile_money", provider: "atl", dot: "#0033A0" },
  { id: "card", label: "Card", paystack_channel: "card", provider: null, dot: null },
];

beforeEach(() => vi.clearAllMocks());

describe("listPaymentChannels", () => {
  it("parses the 048 shape", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_channels: SEEDED });
    const channels = await listPaymentChannels();
    expect(channels).toEqual(SEEDED);
    expect(await getPaymentChannel("card")).toMatchObject({ paystack_channel: "card", provider: null });
    expect(await getPaymentChannel("cash")).toBeNull();
  });

  it("drops a malformed entry and keeps the rest", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({
      payment_channels: [SEEDED[0], { id: "x", label: "Bank", paystack_channel: "bank_transfer", provider: null, dot: null }, SEEDED[3]],
    });
    const channels = await listPaymentChannels();
    expect(channels.map((c) => c.id)).toEqual(["mtn_momo", "card"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("yields nothing for the legacy string array", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_channels: ["MTN MoMo", "Visa"] });
    expect(await listPaymentChannels()).toEqual([]);
  });

  it("falls back to [] on a blip but rethrows a missing table", async () => {
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("Failed to load site settings: timeout"));
    expect(await listPaymentChannels()).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("Could not find the table 'public.site_settings' in the schema cache (PGRST205)"));
    await expect(listPaymentChannels()).rejects.toThrow(/PGRST205/);
  });
});

describe("getPaymentHoldNote", () => {
  it("returns the string or null", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_hold_note: "Paystack holds it until every item is bought" });
    expect(await getPaymentHoldNote()).toBe("Paystack holds it until every item is bought");
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_hold_note: 3 });
    expect(await getPaymentHoldNote()).toBeNull();
    vi.mocked(getSiteSettingsMap).mockResolvedValue({});
    expect(await getPaymentHoldNote()).toBeNull();
  });
});

describe("getBagPaymentSettings", () => {
  it("derives both halves of the pay rail from a single settings read", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_channels: SEEDED, payment_hold_note: "Held until every item is bought" });
    const { channels, holdNote } = await getBagPaymentSettings();
    expect(channels).toEqual(SEEDED);
    expect(holdNote).toBe("Held until every item is bought");
    expect(getSiteSettingsMap).toHaveBeenCalledTimes(1);
  });

  it("degrades to empty channels and no note on a blip, but rethrows a missing table", async () => {
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("Failed to load site settings: timeout"));
    expect(await getBagPaymentSettings()).toEqual({ channels: [], holdNote: null });
    expect(logger.warn).toHaveBeenCalled();
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("Could not find the table 'public.site_settings' in the schema cache (PGRST205)"));
    await expect(getBagPaymentSettings()).rejects.toThrow(/PGRST205/);
  });
});
