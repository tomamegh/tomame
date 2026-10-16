import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/health", () => ({ pingDatabase: vi.fn() }));

import { pingDatabase } from "@/db/queries/health";
import { READINESS_DB_TIMEOUT_MS, READINESS_REUSE_MS, checkReadiness } from "../health.service";

// Each test starts past the previous one's reuse window.
let clock = 0;
const tick = () => (clock += READINESS_REUSE_MS * 10);

beforeEach(() => vi.mocked(pingDatabase).mockReset());

describe("checkReadiness", () => {
  it("is ready when the database read succeeds, within the timeout it asked for", async () => {
    vi.mocked(pingDatabase).mockResolvedValue(undefined);
    const readiness = await checkReadiness(tick());
    expect(readiness.ok).toBe(true);
    expect(readiness.database.ok).toBe(true);
    expect(pingDatabase).toHaveBeenCalledWith(READINESS_DB_TIMEOUT_MS);
  });

  it("is not ready when the read fails or times out, and says why", async () => {
    vi.mocked(pingDatabase).mockRejectedValueOnce(new TypeError("fetch failed"));
    const readiness = await checkReadiness(tick());
    expect(readiness).toMatchObject({ ok: false, database: { ok: false, error: "fetch failed" } });
  });

  it("answers repeat calls inside the reuse window from one database read", async () => {
    vi.mocked(pingDatabase).mockResolvedValue(undefined);
    const at = tick();
    await checkReadiness(at);
    await checkReadiness(at + READINESS_REUSE_MS - 1);
    expect(pingDatabase).toHaveBeenCalledTimes(1);
    await checkReadiness(at + READINESS_REUSE_MS);
    expect(pingDatabase).toHaveBeenCalledTimes(2);
  });
});
