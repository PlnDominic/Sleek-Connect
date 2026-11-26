'use client';

import { useEffect, useState } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import styles from './admin.module.css';

/** The result of an action, fixed at the bottom of the screen so a long form can't hide it. Success fades away. */
export function Toast({ state }: { state: ActionState }) {
  const [dismissed, setDismissed] = useState<ActionState>(null);

  useEffect(() => {
    if (!state?.ok) return;
    const timer = setTimeout(() => setDismissed(state), 6000);
    return () => clearTimeout(timer);
  }, [state]);

  const showing = state && state !== dismissed;
  return (
    <div className={styles.toasts} aria-live="polite">
      {showing && (
        <p role={state.ok ? 'status' : 'alert'} className={`${styles.toast} ${state.ok ? styles.toastOk : styles.toastBad}`}>
          <span>{state.message}</span>
          <button type="button" className={styles.toastClose} aria-label="Dismiss message" onClick={() => setDismissed(state)}>
            ×
          </button>
        </p>
      )}
    </div>
  );
}
