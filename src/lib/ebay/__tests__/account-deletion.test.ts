import { describe, it, expect, vi } from "vitest";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const envState: Record<string, string | null> = { EBAY_VERIFY_TOKEN: null, EBAY_CLIENT_ID: null, EBAY_CLIENT_SECRET: null, EBAY_ENV: null, NEXT_PUBLIC_APP_URL: "https://tomame.ca" };
vi.mock("@/lib/env", () => ({
  env: {
    ebay: {
      get clientId() { return envState.EBAY_CLIENT_ID; },
      get clientSecret() { return envState.EBAY_CLIENT_SECRET; },
      get environment() { return envState.EBAY_ENV; },
      get verifyToken() { return envState.EBAY_VERIFY_TOKEN; },
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })), getClientIp: () => "1.2.3.4" }));
const keyLookup = vi.fn();
vi.mock("@/lib/ebay/client", () => ({ fetchEbayNotificationPublicKey: (kid: string) => keyLookup(kid) }));

import { NextRequest } from "next/server";
import {
  ebayChallengeResponse,
  isValidEbayVerifyToken,
  parseEbayAccountDeletion,
  parseEbaySignatureHeader,
  toPem,
  verifyEbayNotificationSignature,
} from "../account-deletion";
import { GET, POST } from "@/app/api/ebay/account-deletion/route";

const TOKEN = "tomame_ebay_verify_0123456789abcdefABCDEF-_0123456789";
const ENDPOINT = "https://tomame.ca/api/ebay/account-deletion";

describe("challenge", () => {
  it("hashes code + token + endpoint url, in that order, as sha256 hex", () => {
    const expected = createHash("sha256").update("abc" + TOKEN + ENDPOINT).digest("hex");
    expect(ebayChallengeResponse("abc", TOKEN, ENDPOINT)).toBe(expected);
    expect(ebayChallengeResponse("abd", TOKEN, ENDPOINT)).not.toBe(expected);
  });

  it("accepts only eBay's token shape: 32-80 chars of letters, digits, _ and -", () => {
    expect(isValidEbayVerifyToken(TOKEN)).toBe(true);
    expect(isValidEbayVerifyToken("short")).toBe(false);
    expect(isValidEbayVerifyToken("x".repeat(81))).toBe(false);
    expect(isValidEbayVerifyToken("has space " + "x".repeat(30))).toBe(false);
    expect(isValidEbayVerifyToken(null)).toBe(false);
  });

  it("GET answers eBay's handshake as JSON, 503 until the token is provisioned", async () => {
    envState.EBAY_VERIFY_TOKEN = null;
    const unconfigured = await GET(new NextRequest("https://tomame.ca/api/ebay/account-deletion?challenge_code=abc"));
    expect(unconfigured.status).toBe(503);

    envState.EBAY_VERIFY_TOKEN = TOKEN;
    process.env.NEXT_PUBLIC_APP_URL = "https://tomame.ca/";
    const res = await GET(new NextRequest("https://tomame.ca/api/ebay/account-deletion?challenge_code=abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ challengeResponse: ebayChallengeResponse("abc", TOKEN, ENDPOINT) });

    const missing = await GET(new NextRequest("https://tomame.ca/api/ebay/account-deletion"));
    expect(missing.status).toBe(400);
  });
});

describe("notification signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const oneLine = pem.replace(/\n/g, "");
  const body = JSON.stringify({
    metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
    notification: { notificationId: "n-1", eventDate: "2026-10-13T00:00:00.000Z", publishDate: "2026-10-13T00:00:01.000Z", publishAttemptCount: 1, data: { username: "buyer1", userId: "u-1", eiasToken: "e-1" } },
  });
  const sign = (payload: string) => createSign("SHA1").update(payload).sign(privateKey, "base64");
  const header = (signature: string, kid = "kid-1") => Buffer.from(JSON.stringify({ alg: "ecdsa", kid, digest: "SHA1", signature })).toString("base64");

  it("rebuilds PEM from eBay's single-line key and verifies an ECDSA/SHA1 signature over the body", () => {
    expect(toPem(oneLine)).toBe(pem);
    const parsed = parseEbaySignatureHeader(header(sign(body)));
    expect(parsed).toMatchObject({ kid: "kid-1", digest: "SHA1" });
    expect(verifyEbayNotificationSignature(body, parsed!, { key: oneLine, algorithm: "ECDSA", digest: "SHA1" })).toBe(true);
    expect(verifyEbayNotificationSignature(body.replace("buyer1", "buyer2"), parsed!, { key: oneLine, algorithm: "ECDSA", digest: "SHA1" })).toBe(false);
    expect(parseEbaySignatureHeader("not base64 json")).toBeNull();
  });

  it("parses the deletion payload", () => {
    expect(parseEbayAccountDeletion(JSON.parse(body))).toEqual({
      notificationId: "n-1", topic: "MARKETPLACE_ACCOUNT_DELETION", eventDate: "2026-10-13T00:00:00.000Z", username: "buyer1", userId: "u-1", eiasToken: "e-1",
    });
    expect(parseEbayAccountDeletion({})).toBeNull();
  });

  it("POST: 412 without a signature, 503 without a keyset, 204 on a verified notification, 412 on a bad one", async () => {
    const post = (payload: string, sig?: string) =>
      POST(new NextRequest("https://tomame.ca/api/ebay/account-deletion", { method: "POST", body: payload, headers: sig ? { "x-ebay-signature": sig } : {} }));

    expect((await post(body)).status).toBe(412);

    envState.EBAY_CLIENT_ID = null;
    expect((await post(body, header(sign(body)))).status).toBe(503);

    envState.EBAY_CLIENT_ID = "app";
    envState.EBAY_CLIENT_SECRET = "secret";
    keyLookup.mockResolvedValue({ key: oneLine, algorithm: "ECDSA", digest: "SHA1" });
    expect((await post(body, header(sign(body)))).status).toBe(204);
    expect(keyLookup).toHaveBeenCalledWith("kid-1");
    expect((await post(body, header(sign("tampered")))).status).toBe(412);

    keyLookup.mockResolvedValue(null);
    expect((await post(body, header(sign(body)))).status).toBe(503);
  });
});
