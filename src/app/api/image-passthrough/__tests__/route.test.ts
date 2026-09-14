import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));

import { GET } from "@/app/api/image-passthrough/route";
import { checkRateLimit } from "@/lib/rate-limit";

const call = (url: string | null) =>
  GET(new NextRequest(`https://tomame.test/api/image-passthrough${url === null ? "" : `?url=${encodeURIComponent(url)}`}`));

function upstream(contentType: string, bytes = new Uint8Array([1, 2, 3]), ok = true): Response {
  return {
    ok,
    headers: new Headers({ "content-type": contentType, "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  vi.stubGlobal("fetch", vi.fn(async () => upstream("image/jpeg")));
});

describe("image passthrough — what it refuses", () => {
  it("refuses a missing or unparseable url", async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call("not a url")).status).toBe(400);
  });

  it("refuses a non-http protocol, so it cannot be pointed at a file or a script", async () => {
    expect((await call("file:///etc/passwd")).status).toBe(400);
    expect((await call("javascript:alert(1)")).status).toBe(400);
  });

  it("refuses this server's own network, so it is not an SSRF gadget", async () => {
    for (const host of [
      "http://127.0.0.1/x.png",
      "http://localhost/x.png",
      "http://10.0.0.5/x.png",
      "http://192.168.1.4/x.png",
      "http://172.16.0.9/x.png",
      "http://169.254.169.254/latest/meta-data",
      "http://db.internal/x.png",
    ]) {
      expect((await call(host)).status, host).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses an allowlisted host, which belongs on the optimizer instead", async () => {
    expect((await call("https://m.media-amazon.com/images/x.jpg")).status).toBe(400);
  });

  it("refuses anything that is not actually an image, so it cannot serve attacker HTML from our origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream("text/html")));
    expect((await call("https://unlisted.example/x.png")).status).toBe(415);
  });

  it("refuses an oversized image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstream("image/png", new Uint8Array(9 * 1024 * 1024))));
    expect((await call("https://unlisted.example/big.png")).status).toBe(413);
  });

  it("answers 502 when the upstream fails rather than leaking the reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED 10.0.0.1"); }));
    const res = await call("https://unlisted.example/x.png");
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.1");
  });

  it("is rate limited", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false } as never);
    expect((await call("https://unlisted.example/x.png")).status).toBe(429);
  });
});

describe("image passthrough — what it serves", () => {
  it("streams an unlisted store's photo from our own origin, never a redirect", async () => {
    const res = await call("https://www.cmcpro.com/product.jpg");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });
});
