'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import styles from './store.module.css';

/**
 * Follow / Following. The page itself is cached for everyone, so whether this shopper follows the store is read in the browser.
 * Signed-out shoppers are sent to sign in and come back to the store.
 */
export function FollowButton({ slug, name, followers }: { slug: string; name: string; followers: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id ?? null;
  // What the database said when the page loaded, and what the shopper has chosen since.
  const [known, setKnown] = useState<{ userId: string; following: boolean } | null>(null);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    createBrowserSupabase()
      .rpc('is_following_store', { p_slug: slug })
      .then(({ data }) => {
        if (!cancelled) setKnown({ userId, following: data === true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, slug]);

  const initial = known?.userId === userId ? known?.following ?? false : false;
  const following = userId ? (choice ?? initial) : false;
  const count = Math.max(0, followers + (following ? 1 : 0) - (initial ? 1 : 0));

  const toggle = async () => {
    if (!userId) return router.push(`/account?next=${encodeURIComponent(`/store/${slug}`)}`);
    const next = !following;
    setChoice(next);
    setError(null);
    const { error: failure } = await createBrowserSupabase().rpc(next ? 'follow_store' : 'unfollow_store', { p_slug: slug });
    if (failure) {
      setChoice(!next);
      setError(failure.message);
    }
  };

  return (
    <div className={styles.follow}>
      <button type="button" onClick={toggle} aria-pressed={following} aria-label={following ? `Unfollow ${name}` : `Follow ${name}`} data-following={following || undefined}>
        {following ? 'Following' : 'Follow'}
      </button>
      {count > 0 && (
        <span>
          {count} {count === 1 ? 'follower' : 'followers'}
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
