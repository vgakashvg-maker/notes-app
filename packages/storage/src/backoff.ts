/**
 * Jittered exponential backoff for Drive 5xx / 429 retries. Matches the
 * spec: max 3 retries. Each retry waits `base * 2^attempt ± jitter`.
 *
 * Exported separately so adapters can replace [delay] / [random] in tests
 * (the GoogleDriveAdapter does just this).
 */

export interface BackoffConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly delay?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5_000,
};

export async function retry<T>(
  op: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  config: BackoffConfig = DEFAULT_BACKOFF,
): Promise<T> {
  const delay = config.delay ?? defaultDelay;
  const random = config.random ?? Math.random;
  let attempt = 0;
  while (true) {
    try {
      return await op();
    } catch (err) {
      attempt += 1;
      if (attempt > config.maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const base = Math.min(config.baseDelayMs * 2 ** (attempt - 1), config.maxDelayMs);
      // Full-jitter window [0, base): avoids the thundering-herd problem.
      const wait = Math.floor(random() * base);
      await delay(wait);
    }
  }
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
