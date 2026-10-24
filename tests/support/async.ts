/** Explicitly controlled I/O latency; no request is sent to a remote service. */
export function deferred<Value>(): { promise: Promise<Value>; resolve: (value: Value) => void; reject: (error: Error) => void } {
  let resolvePromise: (value: Value) => void = () => {};
  let rejectPromise: (error: Error) => void = () => {};
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

/** Bounds a regression failure instead of allowing a hanging CI process. */
export async function completes<Value>(operation: Promise<Value>, label = 'Native reproduction'): Promise<Value> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out.`)), 2500);
      }),
    ]);
  }
  finally {
    clearTimeout(timeout);
  }
}

/** Waits for a controlled boundary while retaining IndexedDB's own asynchronous event queue. */
export async function until(predicate: () => boolean): Promise<void> {
  await completes((async () => {
    while (!predicate()) await new Promise(resolve => setTimeout(resolve, 0));
  })());
}

/** Captures only the deadlines created by the code under test. */
export function createClock(): {
  schedule: (callback: () => void) => number;
  cancel: (timer: number) => void;
  fire: () => void;
  pending: () => number;
} {
  const callbacks = new Map<number, () => void>();
  let nextTimer = 0;
  return {
    schedule: (callback) => {
      callbacks.set(++nextTimer, callback);
      return nextTimer;
    },
    cancel: timer => { callbacks.delete(timer); },
    fire: () => {
      const pendingCallbacks = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pendingCallbacks) callback();
    },
    pending: () => callbacks.size,
  };
}
