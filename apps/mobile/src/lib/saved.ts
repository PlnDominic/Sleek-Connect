import { useCallback, useSyncExternalStore } from 'react';
import { deviceStorage } from './storage';

const KEY = 'sleek-connect:wishlist:v1';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
// Read as the raw string: it stays the same value until something is saved, which is what the store needs.
const snapshot = () => deviceStorage.getItem(KEY) ?? '[]';

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

/** Products the shopper has saved, newest first, kept on this phone. */
export function useSaved() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]');
  const slugs = parse(raw);
  const has = useCallback((slug: string) => parse(snapshot()).includes(slug), []);
  const toggle = useCallback((slug: string) => {
    const current = parse(snapshot());
    const next = current.includes(slug) ? current.filter((s) => s !== slug) : [slug, ...current].slice(0, 200);
    deviceStorage.setItem(KEY, JSON.stringify(next));
    listeners.forEach((l) => l());
  }, []);
  return { slugs, has, toggle };
}
