'use client';

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from 'react';
import { saveAddress, type AddressState } from './actions';
import styles from './addresses.module.css';

export interface AddressValues {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  area: string;
  ghanapost_gps: string | null;
  directions: string | null;
  is_default: boolean;
}

export function AddressForm({ address, areas, onDone }: { address?: AddressValues; areas: string[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState<AddressState, FormData>(saveAddress.bind(null, address?.id ?? null), null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (!address) formRef.current?.reset();
    onDone?.();
  }, [state, address, onDone]);

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
            Name for this address <span className={styles.optional}>(optional)</span>
            <input name="label" maxLength={40} defaultValue={address?.label ?? ''} placeholder="Home, Office…" />
          </label>
          <label className={styles.field}>
            Recipient’s name
            <input name="recipient_name" required maxLength={120} autoComplete="name" defaultValue={address?.recipient_name} />
          </label>
          <label className={styles.field}>
            Phone number
            <input name="phone" type="tel" required autoComplete="tel" defaultValue={address?.phone} />
          </label>
          <label className={styles.field}>
            Area in Accra
            <select name="area" required defaultValue={address?.area ?? areas[0]}>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            GhanaPost GPS address <span className={styles.optional}>(optional)</span>
            <input name="ghanapost_gps" maxLength={20} defaultValue={address?.ghanapost_gps ?? ''} placeholder="GA-123-4567" />
          </label>
          <label className={styles.field}>
            Directions for the rider <span className={styles.optional}>(optional)</span>
            <input name="directions" maxLength={300} defaultValue={address?.directions ?? ''} placeholder="Landmark, gate colour" />
          </label>
        </div>
        {!address?.is_default && (
          <label className={styles.check}>
            <input type="checkbox" name="is_default" />
            Use as my default address
          </label>
        )}
        <button type="submit" className={styles.primary}>
          {pending ? 'Saving…' : address ? 'Save changes' : 'Save address'}
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
