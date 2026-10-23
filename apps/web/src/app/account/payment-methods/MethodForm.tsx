'use client';

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from 'react';
import { momoNetworks } from '@sleek/shared';
import { savePaymentMethod, type MethodState } from './actions';
import styles from '../addresses/addresses.module.css';

export function MethodForm() {
  const [state, action, pending] = useActionState<MethodState, FormData>(savePaymentMethod, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  // Submit through a transition so a refused save keeps what was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form ref={formRef} onSubmit={submit} className={styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <div className={styles.grid}>
          <label className={styles.field}>
            Network
            <select name="network" required defaultValue="mtn">
              {momoNetworks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Mobile Money number
            <input name="wallet_number" type="tel" inputMode="tel" required autoComplete="tel" placeholder="024 000 0000" />
          </label>
          <label className={styles.field}>
            Name <span className={styles.optional}>(optional)</span>
            <input name="label" maxLength={40} placeholder="Mine, Work…" />
          </label>
        </div>
        <label className={styles.check}>
          <input type="checkbox" name="is_default" />
          Use as my default
        </label>
        <button type="submit" className={styles.primary}>
          {pending ? 'Saving…' : 'Save number'}
        </button>
      </fieldset>
      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? styles.success : styles.error}>
          {state.message}
        </p>
      )}
    </form>
  );
}
