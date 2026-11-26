'use client';

import { useActionState, useState } from 'react';
import styles from '../addresses/addresses.module.css';
import { deleteAccount, type DeleteState } from './actions';
import privacy from './privacy.module.css';

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, null);
  const [typed, setTyped] = useState('');

  return (
    <form action={action} className={styles.form}>
      <label className={privacy.confirm}>
        Type DELETE to confirm
        <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <button type="submit" className={privacy.delete} disabled={pending || typed.trim().toUpperCase() !== 'DELETE'}>
        {pending ? 'Deleting…' : 'Delete my account'}
      </button>
      {state && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
    </form>
  );
}
