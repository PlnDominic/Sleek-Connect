'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import adminStyles from './admin.module.css';
import styles from './signin.module.css';

/** Google's four-colour "G", as in their sign-in branding guidelines. */
function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Sign in with Google. There is no second step after it. */
export function SignInWithGoogle({
  label = 'Continue with Google',
  chooseAccount = false,
}: {
  label?: string;
  /** Ask Google which account to use (for switching accounts). */
  chooseAccount?: boolean;
}) {
  const { signInWithGoogle } = useAuth();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The callback sends people back here with ?error=signin when Google's answer couldn't be used.
  const showError = failed || params.get('error') === 'signin';

  return (
    <>
      <button
        type="button"
        className={styles.google}
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          setBusy(true);
          setFailed(false);
          signInWithGoogle('/admin', { consent: false, chooseAccount }).catch(() => {
            setBusy(false);
            setFailed(true);
          });
        }}
      >
        {busy ? <span className={styles.spinner} aria-hidden="true" /> : <GoogleMark />}
        <span>{busy ? 'Connecting to Google…' : label}</span>
      </button>
      {showError && (
        <p role="alert" className={styles.error}>
          We couldn’t complete that sign-in. Please try again, and pick the Google account your admin added.
        </p>
      )}
    </>
  );
}

/** What to tell someone whose email and password were refused, without revealing which of the two was wrong. */
function passwordError(error: { code?: string; status?: number }): string {
  if (error.code === 'email_not_confirmed') {
    return 'Please confirm your email first. Check your inbox for the link we sent.';
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return 'That email and password don’t match. Please check them and try again.';
}

/** Sign in with an email and password (the account must still be on the staff list). */
export function PasswordSignIn() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await createBrowserSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (failure) {
      setBusy(false);
      setError(passwordError(failure));
      return;
    }
    // Stay busy: the refresh swaps this form for the console (or the "no staff access" screen).
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Sign in with email">
      <div className={styles.field}>
        <label htmlFor={emailId}>Email</label>
        <input
          id={emailId}
          className={styles.input}
          type="email"
          name="email"
          autoComplete="username"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={passwordId}>Password</label>
        <div className={styles.inputWrap}>
          <input
            id={passwordId}
            className={styles.input}
            type={reveal ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setReveal((shown) => !shown)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={busy} aria-busy={busy}>
        {busy && <span className={styles.spinner} aria-hidden="true" />}
        <span>{busy ? 'Signing in…' : 'Sign in'}</span>
      </button>
    </form>
  );
}

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <button
      type="button"
      className={compact ? adminStyles.signOut : styles.link}
      onClick={async () => {
        await signOut();
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
