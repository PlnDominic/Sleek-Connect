'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { asImageKey } from '@sleek/shared';
import { BagProvider, useBag, type BagItem, type BagRemote, type BagStorage } from '@sleek/shared/bag';
import { photoUrl } from '@/lib/photos';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { useAuth } from './AuthProvider';

const browserStorage = (): BagStorage | undefined => (typeof window === 'undefined' ? undefined : window.localStorage);

function accountBag(userId: string): BagRemote {
  const supabase = createBrowserSupabase();
  return {
    key: userId,
    async load() {
      const { data, error } = await supabase.rpc('get_bag');
      if (error) throw error;
      return data.map(
        (row): BagItem => ({
          slug: row.slug,
          name: row.name,
          sizeId: row.size_code ?? undefined,
          sizeLabel: row.size_label ?? undefined,
          unitPrice: row.unit_price_ghs,
          image: asImageKey(row.image_key),
          photo: photoUrl(row.photo_path),
          tint: row.tint,
          kind: row.kind,
          qty: row.quantity,
          inStock: row.in_stock,
          warning: row.warning_label ?? undefined,
        }),
      );
    },
    async save(items) {
      const { error } = await supabase.rpc('set_bag', {
        p_items: items.map((i) => ({ slug: i.slug, size: i.sizeId ?? null, quantity: i.qty })),
      });
      if (error) throw error;
    },
  };
}

/** Picks up changes made on another device when the shopper comes back to this tab. */
function RefreshOnFocus() {
  const { refresh } = useBag();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  return null;
}

/** The shopping bag: kept in localStorage, and saved to the account once the shopper signs in. */
export function WebBagProvider({ children }: { children: ReactNode }) {
  const { user, consented } = useAuth();
  const userId = user?.id;
  const remote = useMemo(() => (userId && consented ? accountBag(userId) : null), [userId, consented]);

  return (
    <BagProvider storage={browserStorage} remote={remote}>
      <RefreshOnFocus />
      {children}
    </BagProvider>
  );
}
