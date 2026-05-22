import { describe, expect, it, vi } from "vitest";
import { retry } from "../backoff.js";

describe("retry", () => {
  const noDelay = async (_: number) => {};
  const noJitter = () => 0;

  it("returns the result on the first successful attempt", async () => {
    const op = vi.fn(async () => "ok");
    const result = await retry(op, () => true, {
      maxAttempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
      delay: noDelay,
      random: noJitter,
    });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxAttempts and then throws", async () => {
    const op = vi.fn(async () => {
      throw new Error("transient");
    });
    await expect(
      retry(op, () => true, {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        delay: noDelay,
        random: noJitter,
      }),
    ).rejects.toThrow(/transient/);
    // initial + 3 retries
    expect(op).toHaveBeenCalledTimes(4);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const op = vi.fn(async () => {
      throw new Error("hard");
    });
    await expect(
      retry(op, () => false, {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        delay: noDelay,
        random: noJitter,
      }),
    ).rejects.toThrow(/hard/);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("uses jittered delays bounded by baseDelay * 2^attempt", async () => {
    const delays: number[] = [];
    const delay = async (ms: number) => {
      delays.push(ms);
    };
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("transient");
      return "ok";
    });
    await retry(op, () => true, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      delay,
      random: () => 0.5,
    });
    // attempt 1 base=100, jitter=0.5*100=50; attempt 2 base=200, jitter=100
    expect(delays).toEqual([50, 100]);
  });

  it("caps the per-attempt delay at maxDelayMs", async () => {
    const delays: number[] = [];
    const op = vi.fn(async () => {
      throw new Error("transient");
    });
    await expect(
      retry(op, () => true, {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 1500,
        delay: async (ms) => {
          delays.push(ms);
        },
        random: () => 0.99,
      }),
    ).rejects.toThrow();
    // base = 1000, 2000, 4000, 8000 but capped at 1500 → jittered ≤ 1485
    expect(delays.every((d) => d <= 1500)).toBe(true);
    // First attempt's base of 1000 is below cap; later attempts are capped.
    expect(delays.length).toBe(4);
  });
});
