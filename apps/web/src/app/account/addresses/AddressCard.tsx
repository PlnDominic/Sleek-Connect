'use client';

import { useCallback, useState, useTransition } from 'react';
import { deleteAddress, makeDefault } from './actions';
import { AddressForm, type AddressValues } from './AddressForm';
import styles from './addresses.module.css';

export function AddressCard({ address, areas }: { address: AddressValues; areas: string[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => setEditing(false), []);
  const title = address.label ?? address.recipient_name;

  return (
    <li className={styles.card} aria-label={title}>
      <div className={styles.cardHead}>
        <strong>{title}</strong>
        {address.is_default && <span className={styles.badge}>Default</span>}
      </div>
      <span>
        {address.recipient_name} · {address.phone}
      </span>
      <span className={styles.muted}>
        {[address.area, address.ghanapost_gps].filter(Boolean).join(' · ')}
        {address.directions && ` · ${address.directions}`}
      </span>
      {editing ? (
        <AddressForm address={address} areas={areas} onDone={close} />
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={() => setEditing(true)}>
            Edit
          </button>
          {!address.is_default && (
            <button type="button" className={styles.link} disabled={pending} onClick={() => startTransition(() => makeDefault(address.id))}>
              Make default
            </button>
          )}
          <button
            type="button"
            className={styles.link}
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Remove ${title}?`)) startTransition(() => deleteAddress(address.id));
            }}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}
