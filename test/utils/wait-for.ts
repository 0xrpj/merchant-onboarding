import { setTimeout as sleep } from 'node:timers/promises';

/** Polls `fetch` until `done` returns true, for background work like the risk worker. */
export const waitFor = async <T>(
  fetch: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 10_000, intervalMs = 50 } = {},
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fetch();
    if (done(value)) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor timed out. Last value: ${JSON.stringify(value)}`,
      );
    }
    await sleep(intervalMs);
  }
};
