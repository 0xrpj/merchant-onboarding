import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = { requestId: string };

// Like a global variable, but each request gets its own copy,
// even when many requests run at the same time.
const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = (
  context: RequestContext,
  callback: () => void,
): void => {
  storage.run(context, callback);
};

/** The current request's ID, or undefined outside a request (e.g. in a queue worker). */
export const getRequestId = (): string | undefined =>
  storage.getStore()?.requestId;
