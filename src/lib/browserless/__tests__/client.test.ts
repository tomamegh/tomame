import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the logger to avoid side effects
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Set env before importing the client
process.env.BROWSERLESS_API_KEY = "test-api-key";

import { browserlessClient } from "../client";

describe("BrowserlessClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("scrapeContent", () => {
    it("should return HTML on successful response", async () => {
      const mockHtml = "<html><body><h1>Product</h1></body></html>";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await browserlessClient.scrapeContent({
        url: "https://www.amazon.com/dp/B0DSVMVYPH",
      });

      expect(result.success).toBe(true);
      expect(result.html).toBe(mockHtml);
      expect(result.error).toBeNull();
    });

    it("should send correct request to browserless API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      });

      await browserlessClient.scrapeContent({
        url: "https://www.amazon.com/dp/B0DSVMVYPH",
        timeout: 10000,
        waitForSelector: "#productTitle",
      });

      expect(global.fetch).toHaveBeenCalledOnce();

      const [calledUrl, calledOptions] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;

      expect(calledUrl).toContain("/content?token=test-api-key");
      expect(calledOptions.method).toBe("POST");

      const body = JSON.parse(calledOptions.body);
      expect(body.url).toBe("https://www.amazon.com/dp/B0DSVMVYPH");
      expect(body.gotoOptions.waitUntil).toBe("networkidle2");
      expect(body.gotoOptions.timeout).toBe(10000);
      expect(body.waitForSelector.selector).toBe("#productTitle");
    });

    it("should not include waitForSelector when not provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      });

      await browserlessClient.scrapeContent({
        url: "https://www.amazon.com/dp/B0DSVMVYPH",
      });

      const body = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body,
      );
      expect(body.waitForSelector).toBeUndefined();
    });

    it("should return error on non-ok response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too many requests"),
      });

      const result = await browserlessClient.scrapeContent({
        url: "https://www.amazon.com/dp/B0DSVMVYPH",
      });

      expect(result.success).toBe(false);
      expect(result.html).toBeNull();
      expect(result.error).toContain("429");
      expect(result.error).toContain("Too many requests");
    });

    it("should return error on fetch exception", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const result = await browserlessClient.scrapeContent({
        url: "https://www.amazon.com/dp/B0DSVMVYPH",
      });

      expect(result.success).toBe(false);
      expect(result.html).toBeNull();
      expect(result.error).toBe("Network timeout");
    });

    it("should throw when BROWSERLESS_API_KEY is missing", async () => {
      const saved = process.env.BROWSERLESS_API_KEY;
      delete process.env.BROWSERLESS_API_KEY;

      await expect(
        browserlessClient.scrapeContent({ url: "https://example.com" }),
      ).rejects.toThrow("Missing required environment variable: BROWSERLESS_API_KEY");

      process.env.BROWSERLESS_API_KEY = saved;
    });
  });
});
