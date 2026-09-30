import { describe, it, expect } from "vitest";

import { nextBackoffDelay } from "@/lib/use-visible-interval";
import { PASTE_POLL } from "@/features/extraction/hooks/usePastes";

describe("paste poll backoff", () => {
  it("starts at 2 s and grows to a 10 s ceiling", () => {
    const delays: number[] = [PASTE_POLL.minMs];
    for (let i = 0; i < 8; i++) delays.push(nextBackoffDelay(delays[delays.length - 1]!, PASTE_POLL));
    expect(delays[0]).toBe(2_000);
    expect(delays[1]).toBe(3_000);
    expect(delays.every((d, i) => i === 0 || d >= delays[i - 1]!)).toBe(true);
    expect(Math.max(...delays)).toBe(10_000);
    expect(delays[delays.length - 1]).toBe(10_000);
  });

  it("keeps a two-minute read well inside the poll budget", () => {
    let elapsed = 0;
    let delay = PASTE_POLL.minMs;
    let requests = 0;
    while (elapsed < 120_000) {
      elapsed += delay;
      requests++;
      delay = nextBackoffDelay(delay, PASTE_POLL);
    }
    // 60 at a flat 2 s; the old `general` budget was 60 per 15 minutes.
    expect(requests).toBeLessThan(20);
  });
});
