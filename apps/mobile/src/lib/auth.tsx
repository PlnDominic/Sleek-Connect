import type { Session, User } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { siteAddress, siteConfigured } from './site';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthValue {
  user: User | null;
  /** True until the saved session (and the shopper's consent record) has been read. */
  loading: boolean;
  /** The shopper has confirmed they are 18 or older and accepted the terms. */
  consented: boolean;
  /** Opens Google's sign-in in the browser and returns when the shopper is signed in. False if they closed it. */
  signInWithGoogle: () => Promise<boolean>;
  /** True on iPhones that can use Sign in with Apple. */
  appleAvailable: boolean;
  /** Shows Apple's sign-in sheet and signs the shopper in. False if they cancelled. */
  signInWithApple: () => Promise<boolean>;
  recordConsent: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

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

  const signInWithGoogle = useCallback(async () => {
    const returnTo = Linking.createURL('auth/callback');
    // Expo Go's address changes with the network and is not on Supabase's allow list, so route through the website, which is.
    const viaSite = Constants.executionEnvironment === ExecutionEnvironment.StoreClient && siteConfigured;
    const redirectTo = viaSite ? `${siteAddress('/auth/mobile')}?to=${encodeURIComponent(returnTo)}` : returnTo;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data.url) throw error ?? new Error('No sign-in address');
    const result = await WebBrowser.openAuthSessionAsync(data.url, returnTo);
    if (result.type !== 'success') return false;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google did not return a sign-in code');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return true;
  }, []);

  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable, () => setAppleAvailable(false));
  }, []);

  const signInWithApple = useCallback(async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token');
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) throw error;
      // Lets the website keep the means to revoke this Apple link if the account is deleted later (best effort).
      if (credential.authorizationCode && data.session) {
        void fetch(siteAddress('/api/account/apple-link'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ authorizationCode: credential.authorizationCode }),
        }).catch(() => {});
      }
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
      throw e;
    }
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
    () => ({ user, loading, consented, signInWithGoogle, appleAvailable, signInWithApple, recordConsent, signOut }),
    [user, loading, consented, signInWithGoogle, appleAvailable, signInWithApple, recordConsent, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
