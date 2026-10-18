'use client';

import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

interface AuthValue {
  user: User | null;
  /** True until the stored session (and the signed-in shopper's profile) has been read. */
  loading: boolean;
  /** Whether the signed-in shopper has confirmed they're 18+ and accepted the terms (PRD FR-003). */
  consented: boolean;
  /**
   * `consent`: the shopper ticked the 18+/terms box, so the callback records it. Staff sign-in passes false.
   * `chooseAccount`: make Google ask which account to use, even if the browser is signed in to just one.
   */
  signInWithGoogle: (next?: string, options?: { consent?: boolean; chooseAccount?: boolean }) => Promise<void>;
  recordConsent: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Keyed by user so a previous shopper's answer never leaks into the next session.
  const [profile, setProfile] = useState<{ userId: string; consented: boolean } | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    createBrowserSupabase()
      .from('profiles')
      .select('confirmed_adult_at, accepted_terms_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile({ userId, consented: Boolean(data?.confirmed_adult_at && data?.accepted_terms_at) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signInWithGoogle = useCallback(
    async (next = '/account', { consent = true, chooseAccount = false }: { consent?: boolean; chooseAccount?: boolean } = {}) => {
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', next);
      if (consent) callback.searchParams.set('consent', '1');
      const { error } = await createBrowserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callback.toString(),
          ...(chooseAccount && { queryParams: { prompt: 'select_account' } }),
        },
      });
      if (error) throw error;
    },
    [],
  );

  const recordConsent = useCallback(async () => {
    if (!userId) return;
    const { error } = await createBrowserSupabase().rpc('record_signup_consent');
    if (error) throw error;
    setProfile({ userId, consented: true });
  }, [userId]);

  const signOut = useCallback(async () => {
    await createBrowserSupabase().auth.signOut();
  }, []);

  const profileLoaded = !!userId && profile?.userId === userId;
  const loading = sessionLoading || (!!userId && !profileLoaded);
  const consented = profileLoaded && profile.consented;

  const value = useMemo(
    () => ({ user, loading, consented, signInWithGoogle, recordConsent, signOut }),
    [user, loading, consented, signInWithGoogle, recordConsent, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
