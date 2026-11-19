'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { useAuth } from './AuthProvider';

interface WishlistValue {
  /** Saved product slugs, newest first. */
  slugs: string[];
  has: (slug: string) => boolean;
  toggle: (slug: string) => void;
}

const WishlistContext = createContext<WishlistValue | null>(null);
const STORAGE_KEY = 'sleek-connect:wishlist:v1';
/** The account the stored list was last synced with, so signing out doesn't leave it on a shared device. */
const OWNER_KEY = 'sleek-connect:wishlist-owner:v1';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// The list lives in localStorage; components read it through useSyncExternalStore.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked storage: nothing is kept.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Other tabs.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const snapshot = () => read(STORAGE_KEY) ?? '[]';
const serverSnapshot = () => '[]';

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

/**
 * Saved products (PRD FR-063). Kept on the device, and in the account once the shopper signs in: signing in merges
 * this device's list into the account's.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, consented } = useAuth();
  const userId = user && consented ? user.id : null;
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const slugs = useMemo(() => parse(raw), [raw]);

  useEffect(() => {
    const owner = read(OWNER_KEY);
    if (!userId) {
      if (owner) {
        // Signed out: forget the account's list on this device.
        write(OWNER_KEY, null);
        write(STORAGE_KEY, null);
      }
      return;
    }
    let cancelled = false;
    const supabase = createBrowserSupabase();
    // A list saved on this device while signed out joins the account's list; another account's list never does.
    const local = owner ? [] : parse(snapshot());
    (local.length ? supabase.rpc('set_wishlist', { p_slugs: local, p_saved: true }) : Promise.resolve({ error: null }))
      .then(() => supabase.rpc('get_wishlist'))
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        write(OWNER_KEY, userId);
        write(STORAGE_KEY, JSON.stringify(data.map((r) => r.slug)));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    (slug: string) => {
      const current = parse(snapshot());
      const saved = !current.includes(slug);
      write(STORAGE_KEY, JSON.stringify(saved ? [slug, ...current].slice(0, 200) : current.filter((s) => s !== slug)));
      if (userId) {
        void createBrowserSupabase()
          .rpc('set_wishlist', { p_slugs: [slug], p_saved: saved })
          .then(({ error }) => {
            if (error) console.error('Saving the wishlist failed', error);
          });
      }
    },
    [userId],
  );

  const value = useMemo(() => ({ slugs, has: (slug: string) => slugs.includes(slug), toggle }), [slugs, toggle]);
  return <WishlistContext value={value}>{children}</WishlistContext>;
}

export function useWishlist(): WishlistValue {
  const value = useContext(WishlistContext);
  if (!value) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return value;
}
