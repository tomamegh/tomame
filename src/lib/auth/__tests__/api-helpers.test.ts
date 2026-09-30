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
      "Unhandled error in API route",
      expect.objectContaining({ error: expect.stringContaining("duplicate key") }),
    );
  });

  it("handles a thrown non-Error the same way", async () => {
    const res = errorResponse("boom");
    expect(await res.json()).toEqual({ error: "Something went wrong", success: false });
    expect(logger.error).toHaveBeenCalledWith("Unhandled error in API route", expect.objectContaining({ error: "boom" }));
  });
});
