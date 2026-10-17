'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import styles from './admin.module.css';

function CodeForm({ onSubmit }: { onSubmit: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await onSubmit(code.replace(/\s/g, '')));
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.field}>
        <span>6-digit code</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? 'Checking…' : 'Verify'}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}

/** First sign-in: adds an authenticator app to the account. */
export function MfaEnroll() {
  const router = useRouter();
  const started = useRef(false);
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const supabase = createBrowserSupabase();
    (async () => {
      // Clear set-ups that were started but never confirmed.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Sleek Connect Store admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError || !data) {
        setError('Couldn’t start the set-up. Refresh the page to try again.');
        return;
      }
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!factor) return <p className={styles.muted}>Preparing…</p>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL from Supabase */}
      <img src={factor.qr} alt="QR code for your authenticator app" width={180} height={180} className={styles.qr} />
      <p className={styles.muted}>
        Can’t scan it? Enter this key instead: <code data-testid="totp-secret">{factor.secret}</code>
      </p>
      <CodeForm
        onSubmit={async (code) => {
          const { error: verifyError } = await createBrowserSupabase().auth.mfa.challengeAndVerify({
            factorId: factor.id,
            code,
          });
          if (verifyError) return 'That code didn’t work. Check the time on your phone and try the newest code.';
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

/** Later sign-ins: confirms the code from the authenticator app. */
export function MfaVerify() {
  const router = useRouter();
  return (
    <CodeForm
      onSubmit={async (code) => {
        const supabase = createBrowserSupabase();
        const { data } = await supabase.auth.mfa.listFactors();
        const factor = data?.totp.find((f) => f.status === 'verified');
        if (!factor) return 'No authenticator app is set up on this account.';
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) return 'That code didn’t work. Try the newest code from your app.';
        router.refresh();
        return null;
      }}
    />
  );
}
