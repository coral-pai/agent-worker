const INITIAL_DELAY_MS = 1000;
const JITTER_MS = 500;
const MAX_DELAY_MS = 60000;
const MAX_BACKOFF_RETRIES = 5;

export type IsRetryable = (err: unknown) => boolean;

export async function withBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: IsRetryable,
  maxRetries: number = MAX_BACKOFF_RETRIES,
): Promise<T> {
  let delay = INITIAL_DELAY_MS;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      const jitter = Math.random() * JITTER_MS;
      await Bun.sleep(delay + jitter);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }
  throw new Error("Unreachable");
}
