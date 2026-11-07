import { useCallback, useEffect, useSyncExternalStore } from 'react';

interface Entry<T> {
  data?: T;
  error?: Error;
  /** A request for this key is in flight. */
  fetching: boolean;
  /** When `data` last arrived. */
  at: number;
}

const cache = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();

const emit = (key: string) => listeners.get(key)?.forEach((l) => l());

function set(key: string, next: Entry<unknown>) {
  cache.set(key, next);
  emit(key);
}

/** Fetches `key` unless fresh data is cached or a request is already running. Never throws. */
function load<T>(key: string, fetcher: () => Promise<T>, staleMs: number, force = false): Promise<void> {
  const existing = cache.get(key) as Entry<T> | undefined;
  if (inflight.has(key)) return inflight.get(key)!;
  if (!force && existing?.data !== undefined && Date.now() - existing.at < staleMs) return Promise.resolve();
  set(key, { data: existing?.data, error: undefined, fetching: true, at: existing?.at ?? 0 });
  const request = fetcher()
    .then((data) => set(key, { data, fetching: false, at: Date.now() }))
    .catch((error: unknown) =>
      // Keep whatever was shown before; just note that refreshing failed.
      set(key, { data: existing?.data, error: error instanceof Error ? error : new Error(String(error)), fetching: false, at: existing?.at ?? 0 }),
    )
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  /** True while a refresh runs behind data that is already on screen. */
  refreshing: boolean;
  refetch: () => Promise<void>;
}

/**
 * Loads data once per `key` and shares it between screens. Cached data shows immediately and is refreshed in the
 * background when it is older than `staleMs`, so going back to a screen feels instant. Pass `null` to wait.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, staleMs = 60_000): QueryResult<T> {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {};
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) as Entry<T> | undefined) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (key) void load(key, fetcher, staleMs);
    // The fetcher is recreated every render; the key says what it fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, staleMs]);

  const refetch = useCallback(() => (key ? load(key, fetcher, staleMs, true) : Promise.resolve()), [key, fetcher, staleMs]);
  const hasData = entry?.data !== undefined;
  return {
    data: entry?.data,
    error: entry?.error,
    loading: Boolean(key) && !hasData && !entry?.error,
    refreshing: Boolean(entry?.fetching) && hasData,
    refetch,
  };
}
