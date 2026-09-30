import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { APIError, errorResponse } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";

beforeEach(() => vi.clearAllMocks());

describe("errorResponse", () => {
  it("answers an APIError with its own status and message", async () => {
    const res = errorResponse(new APIError(409, "Already paid"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Already paid", success: false });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("never sends a raw error message to the browser, and logs it instead", async () => {
    const res = errorResponse(new Error('duplicate key value violates unique constraint "payments_reference_key"'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong", success: false });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled error in API route: duplicate key"),
      expect.objectContaining({ error: expect.stringContaining("duplicate key"), category: "server_5xx" }),
    );
  });

  it("handles a thrown non-Error the same way", async () => {
    const res = errorResponse("boom");
    expect(await res.json()).toEqual({ error: "Something went wrong", success: false });
    expect(logger.error).toHaveBeenCalledWith("Unhandled error in API route: boom", expect.objectContaining({ error: "boom", source: "api" }));
  });

  it("logs a deliberate 5xx, which used to go out without a word", async () => {
    const res = errorResponse(new APIError(502, "Paystack did not answer"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Paystack did not answer", success: false });
    expect(logger.error).toHaveBeenCalledWith("API 502: Paystack did not answer", expect.objectContaining({ status: 502, category: "server_5xx" }));
  });

  it("does not log an ordinary 4xx: those are the customer's answer, reported by the browser", () => {
    errorResponse(new APIError(400, "Enter a phone number we can reach you on"));
    expect(logger.error).not.toHaveBeenCalled();
  });
});
