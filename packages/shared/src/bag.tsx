'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSize, isAvailable, unitPrice, type ImageKey, type Product, type ProductKind } from './catalog';

/** What the bag remembers about a line. Prices are re-checked by the server when the order is placed. */
export interface BagItem {
  slug: string;
  name: string;
  sizeId?: string;
  sizeLabel?: string;
  unitPrice: number;
  image?: ImageKey;
  /** URL of an uploaded product photo; shown instead of `image`. */
  photo?: string;
  tint: string;
  kind: ProductKind;
  qty: number;
  /** False when the server reports the item is sold out. */
  inStock?: boolean;
  /** Safety warning to show with the line (e.g. "Not suitable for children under 3"). */
  warning?: string;
}

export interface ResolvedBagItem extends BagItem {
  lineTotal: number;
}

/** Synchronous key-value storage, e.g. `window.localStorage`. */
export interface BagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Server copy of a signed-in shopper's bag. `key` identifies the account. */
export interface BagRemote {
  key: string;
  load(): Promise<BagItem[]>;
  save(items: BagItem[]): Promise<void>;
}

interface BagValue {
  items: ResolvedBagItem[];
  count: number;
  subtotal: number;
  /** True while a signed-in shopper's saved bag is being loaded and merged. */
  syncing: boolean;
  add: (product: Product, sizeId?: string, qty?: number) => void;
  setQty: (slug: string, sizeId: string | undefined, qty: number) => void;
  remove: (slug: string, sizeId: string | undefined) => void;
  clear: () => void;
  /** Reloads the saved bag (e.g. after another device changed it). */
  refresh: () => Promise<void>;
}

export const MAX_ITEM_QTY = 20;

const BagContext = createContext<BagValue | null>(null);
const STORAGE_KEY = 'sleek-connect:bag:v1';
/** Which account the stored bag belongs to, and whether it has edits the account hasn't received yet. */
const SYNC_KEY = 'sleek-connect:bag-sync:v1';
const SAVE_DELAY_MS = 400;

interface SyncState {
  owner: string;
  dirty: boolean;
}

function readSync(storage: (() => BagStorage | undefined) | undefined): SyncState | null {
  try {
    const value = JSON.parse(storage?.()?.getItem(SYNC_KEY) ?? 'null') as Partial<SyncState> | null;
    return typeof value?.owner === 'string' ? { owner: value.owner, dirty: value.dirty === true } : null;
  } catch {
    return null;
  }
}

function writeSync(storage: (() => BagStorage | undefined) | undefined, state: SyncState | null) {
  try {
    storage?.()?.setItem(SYNC_KEY, JSON.stringify(state));
  } catch {
    // Blocked storage: the next page load treats the bag as a fresh sign-in and merges it.
  }
}

const lineKey = (slug: string, sizeId?: string) => `${slug}|${sizeId ?? ''}`;
const clampQty = (qty: number) => Math.min(MAX_ITEM_QTY, Math.max(1, Math.round(qty)));

export function bagItemFrom(product: Product, sizeId = product.defaultSize, qty = 1): BagItem {
  return {
    slug: product.slug,
    name: product.name,
    sizeId,
    sizeLabel: getSize(product, sizeId)?.label,
    unitPrice: unitPrice(product, sizeId),
    image: product.image,
    photo: product.photos?.[0]?.url,
    tint: product.tint,
    kind: product.kind,
    qty: clampQty(qty),
    inStock: isAvailable(product, sizeId),
    warning: product.warningLabel,
  };
}

/** Combines a device's bag with the saved one: saved details win, and each line keeps the larger quantity. */
export function mergeBags(saved: BagItem[], local: BagItem[]): BagItem[] {
  const merged = new Map(saved.map((item) => [lineKey(item.slug, item.sizeId), item]));
  for (const item of local) {
    const key = lineKey(item.slug, item.sizeId);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, qty: Math.max(existing.qty, item.qty) } : item);
  }
  return [...merged.values()];
}

function isBagItem(value: unknown): value is BagItem {
  const v = value as BagItem;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.slug === 'string' &&
    typeof v.name === 'string' &&
    typeof v.unitPrice === 'number' &&
    Number.isInteger(v.qty) &&
    v.qty > 0
  );
}

interface BagProviderProps {
  children: ReactNode;
  initialItems?: BagItem[];
  /**
   * When set, the bag is restored from and saved to this storage.
   * Pass a stable function (defined at module level), not an inline arrow.
   */
  storage?: () => BagStorage | undefined;
  /** When set, the bag is merged with and saved to the shopper's account. Null when signed out. */
  remote?: BagRemote | null;
}

export function BagProvider({ children, initialItems = [], storage, remote = null }: BagProviderProps) {
  const [items, setItems] = useState<BagItem[]>(initialItems);
  // Nothing is saved until the stored bag has been read, so it is never overwritten.
  const [restored, setRestored] = useState(!storage);
  // The account whose saved bag has been merged in; saving to the server waits for this.
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  // The items last read from or written to the account, so they aren't echoed back as a change.
  const serverItemsRef = useRef<BagItem[] | null>(null);
  const itemsRef = useRef(items);
  const remoteRef = useRef(remote);
  useEffect(() => {
    itemsRef.current = items;
    remoteRef.current = remote;
  });

  // Restore after mount so server-rendered markup and the first client render match.
  useEffect(() => {
    if (restored) return;
    try {
      const saved: unknown = JSON.parse(storage?.()?.getItem(STORAGE_KEY) ?? 'null');
      if (Array.isArray(saved)) setItems(saved.filter(isBagItem));
    } catch {
      // Unreadable or blocked storage: start with an empty bag.
    }
    setRestored(true);
  }, [restored, storage]);

  useEffect(() => {
    if (!restored || !storage) return;
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or blocked: the bag still works for this visit.
    }
  }, [items, restored, storage]);

  // Signing in merges this device's bag into the saved one; signing out empties the bag on this device.
  const remoteKey = remote?.key ?? null;
  useEffect(() => {
    if (!restored) return;
    if (!remote) {
      if (syncedKey !== null) {
        setItems([]);
        setSyncedKey(null);
        serverItemsRef.current = null;
        writeSync(storage, null);
      }
      return;
    }
    if (syncedKey === remote.key) return;
    let cancelled = false;
    remote
      .load()
      .then((saved) => {
        if (cancelled) return;
        // In this tab we may be switching straight from another account; otherwise ask storage whose bag this is.
        const sync = syncedKey === null ? readSync(storage) : { owner: syncedKey, dirty: false };
        let next: BagItem[];
        if (sync === null) next = mergeBags(saved, itemsRef.current); // signing in: bring this device's bag along
        else if (sync.owner !== remote.key) next = saved; // never carry another account's bag over
        else if (sync.dirty) next = itemsRef.current; // edits made here that never reached the account
        else next = saved; // a copy of the account's bag: the account is up to date
        serverItemsRef.current = next;
        setItems(next);
        setSyncedKey(remote.key);
        writeSync(storage, { owner: remote.key, dirty: false });
        if (next !== saved) return remote.save(next);
      })
      .catch(() => {
        // Keep the device's bag; the next change or sign-in retries the sync.
      });
    return () => {
      cancelled = true;
    };
    // `remote` is read through its key; a new object for the same account must not re-run the merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey, restored, syncedKey, storage]);

  // Write changes through to the account, batching quick successive edits.
  useEffect(() => {
    const current = remoteRef.current;
    if (!current || syncedKey !== current.key || items === serverItemsRef.current) return;
    writeSync(storage, { owner: current.key, dirty: true });
    const timer = setTimeout(() => {
      current.save(items).then(
        () => {
          serverItemsRef.current = items;
          if (itemsRef.current === items) writeSync(storage, { owner: current.key, dirty: false });
        },
        () => {
          // A failed save stays marked as unsent and is retried on the next change or page load.
        },
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [items, syncedKey, storage]);

  const refresh = useCallback(async () => {
    const current = remoteRef.current;
    if (!current || syncedKey !== current.key) return;
    // Unsent edits on this device take priority; they'll be saved shortly.
    if (itemsRef.current !== serverItemsRef.current) return;
    try {
      const saved = await current.load();
      if (itemsRef.current !== serverItemsRef.current) return;
      serverItemsRef.current = saved;
      setItems(saved);
    } catch {
      // Keep what's on screen if the saved bag can't be fetched.
    }
  }, [syncedKey]);

  // Stable across renders, so callers can list them as effect dependencies.
  const actions = useMemo(() => {
    const matches = (item: BagItem, slug: string, sizeId?: string) => item.slug === slug && item.sizeId === sizeId;
    return {
      add: (product: Product, sizeId = product.defaultSize, qty = 1) =>
        setItems((current) => {
          const existing = current.find((i) => matches(i, product.slug, sizeId));
          if (existing) {
            return current.map((i) => (i === existing ? { ...i, qty: clampQty(i.qty + qty) } : i));
          }
          return [...current, bagItemFrom(product, sizeId, qty)];
        }),
      setQty: (slug: string, sizeId: string | undefined, qty: number) =>
        setItems((current) => current.map((i) => (matches(i, slug, sizeId) ? { ...i, qty: clampQty(qty) } : i))),
      remove: (slug: string, sizeId: string | undefined) =>
        setItems((current) => current.filter((i) => !matches(i, slug, sizeId))),
      clear: () => setItems((current) => (current.length === 0 ? current : [])),
    };
  }, []);

  const value = useMemo<BagValue>(() => {
    const resolved = items.map((item) => ({ ...item, lineTotal: item.unitPrice * item.qty }));
    return {
      items: resolved,
      count: resolved.reduce((sum, i) => sum + i.qty, 0),
      subtotal: resolved.reduce((sum, i) => sum + i.lineTotal, 0),
      syncing: remote !== null && syncedKey !== remote.key,
      ...actions,
      refresh,
    };
  }, [items, remote, syncedKey, actions, refresh]);

  return <BagContext value={value}>{children}</BagContext>;
}

export function useBag(): BagValue {
  const value = useContext(BagContext);
  if (!value) throw new Error('useBag must be used inside <BagProvider>');
  return value;
}
