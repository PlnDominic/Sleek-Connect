import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthValue {
  user: User | null;
  /** True until the saved session (and the shopper's consent record) has been read. */
  loading: boolean;
  /** The shopper has confirmed they are 18 or older and accepted the terms. */
  consented: boolean;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<void>;
  /** Opens Google's sign-in in the browser and returns when the shopper is signed in. False if they closed it. */
  signInWithGoogle: () => Promise<boolean>;
  recordConsent: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** 024 123 4567 or +233241234567 to +233241234567; anything else is not a Ghana number. */
export function normalizeGhanaPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+233${compact.slice(1)}`;
  if (/^\+233\d{9}$/.test(compact)) return compact;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Keyed by user so a previous shopper's answer never leaks into the next session.
  const [profile, setProfile] = useState<{ userId: string; consented: boolean } | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoading(false);
    });
    // Tokens are only refreshed while the app is on screen.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    void supabase.auth.startAutoRefresh();
    return () => {
      data.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  const user = session?.user ?? null;
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('confirmed_adult_at, accepted_terms_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { confirmed_adult_at: string | null; accepted_terms_at: string | null } | null;
        if (!cancelled) setProfile({ userId, consented: Boolean(row?.confirmed_adult_at && row?.accepted_terms_at) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data.url) throw error ?? new Error('No sign-in address');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return false;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google did not return a sign-in code');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return true;
  }, []);

  const recordConsent = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.rpc('record_signup_consent');
    if (error) throw error;
    setProfile({ userId, consented: true });
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const profileLoaded = !!userId && profile?.userId === userId;
  const loading = sessionLoading || (!!userId && !profileLoaded);
  const consented = profileLoaded && profile.consented;

  const value = useMemo(
    () => ({ user, loading, consented, sendPhoneOtp, verifyPhoneOtp, signInWithGoogle, recordConsent, signOut }),
    [user, loading, consented, sendPhoneOtp, verifyPhoneOtp, signInWithGoogle, recordConsent, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
