'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import styles from './admin.module.css';

export function SignInWithGoogle() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={styles.primary}
        onClick={() => signInWithGoogle('/admin', { consent: false }).catch(() => setError('Couldn’t reach Google. Try again.'))}
      >
        Continue with Google
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <button
      type="button"
      className={compact ? styles.linkButton : styles.secondary}
      onClick={async () => {
        await signOut();
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
