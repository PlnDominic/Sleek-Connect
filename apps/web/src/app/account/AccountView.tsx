'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useBag } from '@sleek/shared/bag';
import { useAuth } from '@/components/AuthProvider';
import { safeNextPath } from '@/lib/safe-redirect';
import { AccountSummary } from './AccountSummary';
import styles from './account.module.css';

export function AccountView({ mode = 'overview' }: { mode?: 'overview' | 'details' }) {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNextPath(params.get('next'));
  const { user, loading, consented, signInWithGoogle, recordConsent, signOut, signOutEverywhere, updateProfile, updateNotificationPreferences } = useAuth();
  const { count } = useBag();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    params.get('error') === 'signin' ? "We couldn't sign you in with Google. Please try again." : null,
  );

  // Sent here to sign in on the way somewhere (checkout, the bag): carry on once signed in and confirmed, whichever way they signed in.
  const wantsNext = params.get('next') !== null;
  useEffect(() => {
    if (wantsNext && user && consented) router.replace(next);
  }, [wantsNext, user, consented, next, router]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  if (loading) {
    return <p className={styles.muted}>Loading…</p>;
  }

  const consentBox = (
    <label className={styles.consent}>
      <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
      <span>
        I&apos;m 18 or older and I accept the <Link href="/terms" target="_blank">Terms of Service</Link> and{' '}
        <Link href="/privacy" target="_blank">Privacy Notice</Link>.
      </span>
    </label>
  );

  if (!user) {
    return (
      <section className={styles.panel} aria-labelledby="sign-in-title">
        <h2 id="sign-in-title">Sign in</h2>
        <p className={styles.muted}>
          Sign in with Google to check out and to keep your bag on every device you shop from.
        </p>
        {consentBox}
        <button
          type="button"
          className={styles.google}
          disabled={!agreed || busy}
          onClick={() => run(() => signInWithGoogle(next), "We couldn't reach Google. Please try again.")}
        >
          <GoogleMark />
          Continue with Google
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </section>
    );
  }

  const name = (user.user_metadata.full_name ?? user.user_metadata.name) as string | undefined;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name || name.length > 120) {
      setProfileMessage('Enter a name of up to 120 characters.');
      return;
    }
    setBusy(true);
    setProfileMessage(null);
    try {
      await updateProfile(name);
      setProfileMessage('Your profile has been saved.');
    } catch {
      setProfileMessage("We couldn't save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotificationPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProfileMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await updateNotificationPreferences({
        sms: form.get('marketing_sms') === 'on',
        email: form.get('marketing_email') === 'on',
      });
      setProfileMessage('Notification preferences saved.');
    } catch {
      setProfileMessage("We couldn't save your notification preferences. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const initial = (name ?? user.email ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className={styles.dash} role="region" aria-labelledby="signed-in-title">
      {mode === 'overview' && <header className={styles.dashHead}>
        <span className={styles.avatar} aria-hidden="true">{initial}</span>
        <div className={styles.dashWho}>
          <h2 id="signed-in-title">{name ? `Hello, ${name}` : 'Signed in'}</h2>
          {user.email && <p className={styles.muted}>{user.email}</p>}
        </div>
      </header>}

      {!consented && (
        <div className={styles.confirm}>
          <strong>One more step</strong>
          <p>Please confirm the following before we save your bag to your account.</p>
          {consentBox}
          <button
            type="button"
            className={styles.primary}
            disabled={!agreed || busy}
            onClick={() => run(recordConsent, "We couldn't save that. Please try again.")}
          >
            Confirm
          </button>
        </div>
      )}

      {mode === 'overview' && <AccountSummary name={name} email={user.email ?? ''} userId={user.id} marketingSms={Boolean(user.user_metadata.marketing_sms_opted_in)} marketingEmail={Boolean(user.user_metadata.marketing_email_opted_in)} bagCount={count} />}

      {mode === 'overview' && consented && <p className={styles.saved}>Your bag is saved to this account, so it follows you to any device.</p>}

      {mode === 'details' && <><div className={styles.dashGrid}>
        <form className={styles.card} onSubmit={saveProfile}>
          <h3>Profile</h3>
          <label className={styles.field}>
            <span>Name</span>
            <input
              className={styles.input}
              name="name"
              maxLength={120}
              defaultValue={name ?? ''}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>
          <p className={styles.muted}>Your name is used on your account and to prefill checkout details.</p>
          <button type="submit" className={styles.primary} disabled={busy}>Save profile</button>
        </form>

        <form className={styles.card} onSubmit={saveNotificationPreferences}>
          <h3>Notifications</h3>
          <p className={styles.muted}>
            Order, payment, delivery, return and support updates are always sent when needed. These choices control
            marketing messages only.
          </p>
          <label className={styles.preference}>
            <input type="checkbox" name="marketing_sms" defaultChecked={Boolean(user.user_metadata.marketing_sms_opted_in)} />
            <span>Offers and new-arrival updates by SMS</span>
          </label>
          <label className={styles.preference}>
            <input type="checkbox" name="marketing_email" defaultChecked={Boolean(user.user_metadata.marketing_email_opted_in)} />
            <span>Offers and new-arrival updates by email</span>
          </label>
          <button type="submit" className={styles.primary} disabled={busy}>Save preferences</button>
        </form>
      </div>

      {profileMessage && (
        <p role="status" className={styles.saved}>
          {profileMessage}
        </p>
      )}

      <section className={styles.card} aria-labelledby="sessions-title">
        <h3 id="sessions-title">Sign out</h3>
        <div className={styles.sessionRow}>
          <p className={styles.muted}>Signing out empties the bag on this device. It stays saved in your account.</p>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => run(signOut, "We couldn't sign you out. Please try again.")}
          >
            Sign out
          </button>
        </div>
        <div className={styles.sessionRow}>
          <p className={styles.muted}>Use this if you have left your account signed in on another device.</p>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => run(signOutEverywhere, "We couldn't sign you out of your other sessions. Please try again.")}
          >
            Sign out everywhere
          </button>
        </div>
      </section></>}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
