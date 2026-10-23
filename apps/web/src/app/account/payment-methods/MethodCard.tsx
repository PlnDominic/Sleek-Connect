'use client';

import { useTransition } from 'react';
import { momoNetworks, type MomoNetwork } from '@sleek/shared';
import { deletePaymentMethod, makeDefaultPaymentMethod } from './actions';
import styles from '../addresses/addresses.module.css';

export interface MethodValues {
  id: string;
  network: MomoNetwork;
  wallet_number: string;
  label: string | null;
  is_default: boolean;
}

/** "•••• 4321": enough to recognise a number without writing it all out. */
export const maskWallet = (n: string) => `•••• ${n.replace(/\D/g, '').slice(-4)}`;

export function MethodCard({ method }: { method: MethodValues }) {
  const [pending, startTransition] = useTransition();
  const network = momoNetworks.find((n) => n.id === method.network)?.label ?? method.network;
  const title = method.label ?? network;

  return (
    <li className={styles.card} aria-label={`${title} ${maskWallet(method.wallet_number)}`}>
      <div className={styles.cardHead}>
        <strong>{title}</strong>
        {method.is_default && <span className={styles.badge}>Default</span>}
      </div>
      <span>
        {network} · {maskWallet(method.wallet_number)}
      </span>
      <div className={styles.actions}>
        {!method.is_default && (
          <button type="button" className={styles.link} disabled={pending} onClick={() => startTransition(() => makeDefaultPaymentMethod(method.id))}>
            Make default
          </button>
        )}
        <button
          type="button"
          className={styles.link}
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Remove ${title} ${maskWallet(method.wallet_number)}?`)) startTransition(() => deletePaymentMethod(method.id));
          }}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
