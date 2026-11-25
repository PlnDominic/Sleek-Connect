import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { useQuery } from './query';
import { deviceStorage } from './storage';
import { shopperClient, supabase } from './supabase';

const guestKey = 'sleek-connect:wishlist:v1';
const accountKey = (id: string) => `${guestKey}:${id}`;
const pendingKey = (id: string) => `${accountKey(id)}:pending`;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const notify = () => listeners.forEach((listener) => listener());

function parse<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

function readSlugs(key: string): string[] {
  const value = parse<unknown>(deviceStorage.getItem(key), []);
  return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === 'string').slice(0, 200) : [];
}

function readPending(owner: string): Record<string, boolean> {
  const value = parse<unknown>(deviceStorage.getItem(pendingKey(owner)), {});
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, saved]) => typeof saved === 'boolean'))
    : {};
}

function withChanges(slugs: string[], pending: Record<string, boolean>) {
  const added = Object.keys(pending).filter((slug) => pending[slug] && !slugs.includes(slug)).reverse();
  return [...added, ...slugs.filter((slug) => pending[slug] !== false)].slice(0, 200);
}

async function currentAccount(owner: string) {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== owner) throw new Error('The saved-items account changed.');
  return shopperClient(data.session.access_token);
}

async function syncSaved(owner: string) {
  await currentAccount(owner);
  const guests = readSlugs(guestKey);
  if (guests.length) {
    const merged = { ...Object.fromEntries(guests.map((slug) => [slug, true])), ...readPending(owner) };
    deviceStorage.setItem(pendingKey(owner), JSON.stringify(merged));
    deviceStorage.setItem(guestKey, '[]');
    notify();
  }

  for (;;) {
    const pending = readPending(owner);
    for (const saved of [false, true]) {
      const slugs = Object.keys(pending).filter((slug) => pending[slug] === saved);
      for (let i = 0; i < slugs.length; i += 50) {
        const client = await currentAccount(owner);
        const { error } = await client.rpc('set_wishlist', { p_slugs: slugs.slice(i, i + 50), p_saved: saved });
        if (error?.code === '22023') throw new Error('Your saved list is full. Remove an item to sync more.');
        if (error) throw error;
      }
    }
    const client = await currentAccount(owner);
    const { data, error } = await client.rpc('get_wishlist');
    if (error) throw error;
    await currentAccount(owner);
    const latest = readPending(owner);
    const unprocessed = Object.fromEntries(Object.entries(latest).filter(([slug, saved]) => pending[slug] !== saved));
    deviceStorage.setItem(accountKey(owner), JSON.stringify(((data ?? []) as { slug: string }[]).map((row) => row.slug)));
    deviceStorage.setItem(pendingKey(owner), JSON.stringify(unprocessed));
    notify();
    if (!Object.keys(unprocessed).length) return true;
  }
}

export function useSaved() {
  const { user, consented } = useAuth();
  const owner = user && consented ? user.id : null;
  const load = useCallback(() => syncSaved(owner!), [owner]);
  const query = useQuery(owner ? `saved:${owner}` : null, load, 30_000);
  const key = owner ? accountKey(owner) : guestKey;
  useSyncExternalStore(subscribe, () => JSON.stringify([deviceStorage.getItem(key), owner ? deviceStorage.getItem(pendingKey(owner)) : null]), () => '[]');
  const slugs = withChanges(readSlugs(key), owner ? readPending(owner) : {});
  const toggle = (slug: string) => {
    const saved = !slugs.includes(slug);
    if (owner) {
      deviceStorage.setItem(pendingKey(owner), JSON.stringify({ ...readPending(owner), [slug]: saved }));
      void query.refetch();
    } else {
      deviceStorage.setItem(guestKey, JSON.stringify(withChanges(slugs, { [slug]: saved })));
    }
    notify();
  };
  return { slugs, has: (slug: string) => slugs.includes(slug), toggle, ...query };
}

export function SavedSetup() {
  const { refetch } = useSaved();
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refetch(); });
    return () => listener.remove();
  }, [refetch]);
  return null;
}
