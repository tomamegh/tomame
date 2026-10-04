import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/db/queries/site-banners", () => ({
  listLiveBanners: vi.fn(),
  getBannerById: vi.fn(),
  insertBanner: vi.fn(),
  updateBanner: vi.fn(),
  deleteBanner: vi.fn(),
}));

import * as queries from "@/db/queries/site-banners";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createBannerSchema, updateBannerSchema } from "../schema";
import { editBanner, getLiveBanners, removeBanner } from "../services/banners.service";
import { bannerStatus, type SiteBanner } from "../types";

const actor = { id: "admin-1", email: "a@tomame.test" };
const row = (over: Partial<SiteBanner> = {}): SiteBanner => ({
  id: "b1", placement: "checkout", tone: "warning", title: "Ghana payments only", body: null, link_label: null, link_url: null,
  is_active: false, dismissible: false, starts_at: null, ends_at: null, sort_order: 0, created_at: "", updated_at: "", ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("banner schema", () => {
  it("fills defaults and turns blanks into null", () => {
    const parsed = createBannerSchema.parse({ placement: "checkout", title: " Hi ", body: "  ", link_label: "", link_url: "" });
    expect(parsed).toMatchObject({ tone: "info", title: "Hi", body: null, link_label: null, link_url: null, is_active: false });
  });

  it("only allows links to our pages or https", () => {
    const base = { placement: "checkout", title: "x", link_label: "Read" };
    expect(createBannerSchema.safeParse({ ...base, link_url: "/policies#payment" }).success).toBe(true);
    expect(createBannerSchema.safeParse({ ...base, link_url: "https://paystack.com" }).success).toBe(true);
    expect(createBannerSchema.safeParse({ ...base, link_url: "javascript:alert(1)" }).success).toBe(false);
    expect(createBannerSchema.safeParse({ ...base, link_url: "//evil.test" }).success).toBe(false);
  });

  it("needs link text and target together, and an end after the start", () => {
    expect(createBannerSchema.safeParse({ placement: "checkout", title: "x", link_label: "Read" }).success).toBe(false);
    expect(
      createBannerSchema.safeParse({ placement: "checkout", title: "x", starts_at: "2026-10-05T00:00:00Z", ends_at: "2026-10-04T00:00:00Z" }).success,
    ).toBe(false);
  });

  it("rejects an unknown section and an empty patch", () => {
    expect(createBannerSchema.safeParse({ placement: "footer", title: "x" }).success).toBe(false);
    expect(updateBannerSchema.safeParse({}).success).toBe(false);
    expect(updateBannerSchema.safeParse({ is_active: true }).success).toBe(true);
  });
});

describe("bannerStatus", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  it("reads off, scheduled, live and ended", () => {
    expect(bannerStatus(row(), now)).toBe("off");
    expect(bannerStatus(row({ is_active: true }), now)).toBe("live");
    expect(bannerStatus(row({ is_active: true, starts_at: "2026-10-05T00:00:00Z" }), now)).toBe("scheduled");
    expect(bannerStatus(row({ is_active: true, ends_at: "2026-10-04T11:00:00Z" }), now)).toBe("ended");
  });
});

describe("banners service", () => {
  it("renders nothing rather than failing the page when the read breaks", async () => {
    vi.mocked(queries.listLiveBanners).mockRejectedValue(new Error("down"));
    await expect(getLiveBanners("checkout")).resolves.toEqual([]);
  });

  it("audits a switch-on with the before and after", async () => {
    vi.mocked(queries.getBannerById).mockResolvedValue(row());
    vi.mocked(queries.updateBanner).mockResolvedValue(row({ is_active: true }));
    await editBanner(actor, "b1", { is_active: true });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "banner_updated", entityType: "site_banner", metadata: expect.objectContaining({ is_active: { from: false, to: true } }) }),
    );
  });

  it("refuses half a link against the stored row", async () => {
    vi.mocked(queries.getBannerById).mockResolvedValue(row());
    await expect(editBanner(actor, "b1", { link_label: "Read more" })).rejects.toMatchObject({ statusCode: 400 });
    expect(queries.updateBanner).not.toHaveBeenCalled();
  });

  it("404s a missing banner on edit and delete", async () => {
    vi.mocked(queries.getBannerById).mockResolvedValue(null);
    await expect(editBanner(actor, "nope", { is_active: true })).rejects.toMatchObject({ statusCode: 404 });
    await expect(removeBanner(actor, "nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});
