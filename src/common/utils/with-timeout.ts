/**
 * Rejects if `promise` takes longer than `ms`. Every call to another system
 * (here: Redis) gets a time limit, so a request never hangs on it.
 * Note: the original operation isn't cancelled; it may still finish later.
 */
export const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};
