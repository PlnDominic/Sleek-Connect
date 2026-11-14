'use client';

import { useActionState, useTransition, type FormEvent } from 'react';
import { trackOrder, type TrackState } from './actions';
import styles from '../help/help.module.css';

export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, null);
  const [, startTransition] = useTransition();
  // Submit through a transition so a failed lookup keeps what was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            Order number
            <input name="order_number" required autoComplete="off" placeholder="SC-1234" autoCapitalize="characters" />
          </label>
          <label className={styles.field}>
            Phone number used at checkout
            <input name="phone" type="tel" required autoComplete="tel" placeholder="024 123 4567" />
          </label>
        </div>
        <button type="submit" className={styles.primary}>
          {pending ? 'Looking…' : 'Track order'}
        </button>
      </fieldset>
      {state?.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
    </form>
  );
}
