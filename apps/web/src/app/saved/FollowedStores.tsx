'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { vendorAssetUrl } from '@/lib/photos';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import styles from '@/components/listing/listing.module.css';

interface FollowedStore {
  slug: string;
  name: string;
  tagline: string | null;
  logo_path: string | null;
}

/** The stores the signed-in shopper follows. Shown on the Saved page; nothing is shown to signed-out visitors or when there are none. */
export function FollowedStores() {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{ userId: string; stores: FollowedStore[] } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    createBrowserSupabase()
      .rpc('my_followed_stores')
      .then(({ data }) => {
        if (!cancelled) setLoaded({ userId, stores: Array.isArray(data) ? (data as unknown as FollowedStore[]) : [] });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId || loaded?.userId !== userId || loaded.stores.length === 0) return null;
  return (
    <section aria-labelledby="followed-stores" className={styles.followed}>
      <h2 id="followed-stores" className={styles.count}>
        Stores you follow
      </h2>
      <ul>
        {loaded.stores.map((store) => {
          const logo = vendorAssetUrl(store.logo_path);
          return (
            <li key={store.slug}>
              <Link href={`/store/${store.slug}`}>
                {logo ? <Image src={logo} alt="" width={44} height={44} /> : <span aria-hidden="true">{store.name.slice(0, 1).toUpperCase()}</span>}
                <strong>{store.name}</strong>
                {store.tagline && <small>{store.tagline}</small>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
