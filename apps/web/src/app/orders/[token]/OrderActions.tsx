'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { isAvailable, type Product } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { cancelOrder } from './actions';
import styles from './order.module.css';

const reasons = ['Ordered by mistake', 'Changed my mind', 'Wrong delivery details', 'Taking too long', 'Something else'];

/** "Cancel order", until packing starts. Paid orders are refunded. */
export function CancelOrder({ token, paid }: { token: string; paid: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>
        Cancel order
      </button>
    );
  }
  return (
    <div className={styles.cancelBox} role="group" aria-labelledby="cancel-title">
      <strong id="cancel-title">Cancel this order?</strong>
      <span className={styles.muted}>
        {paid
          ? 'We’ll refund your payment to the wallet or card you paid with and text you when it’s done.'
          : 'Nothing has been paid, so there’s nothing to refund.'}
      </span>
      <label className={styles.cancelField}>
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.danger}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelOrder(token, reason);
              if (!result.ok) return setError(result.message);
              setOpen(false);
              router.refresh();
            })
          }
        >
          {pending ? 'Cancelling…' : 'Yes, cancel order'}
        </button>
        <button type="button" className={styles.secondary} disabled={pending} onClick={() => setOpen(false)}>
          Keep my order
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export interface ReorderLine {
  slug: string | null;
  sizeCode: string | null;
  quantity: number;
  name: string;
}

/** "Buy again": puts what's still available back in the bag (PRD FR-051). */
export function BuyAgain({ lines, products }: { lines: ReorderLine[]; products: Product[] }) {
  const router = useRouter();
  const { add } = useBag();
  const [missing, setMissing] = useState<string[] | null>(null);

  const reorder = () => {
    const unavailable: string[] = [];
    for (const line of lines) {
      const product = products.find((p) => p.slug === line.slug);
      const size = line.sizeCode ?? undefined;
      if (!product || !isAvailable(product, size) || (size && !product.sizes?.some((s) => s.id === size))) {
        unavailable.push(line.name);
        continue;
      }
      add(product, size, line.quantity);
    }
    if (unavailable.length === 0) return router.push('/bag');
    setMissing(unavailable);
  };

  return (
    <>
      <button type="button" className={styles.primary} onClick={reorder}>
        Buy again
      </button>
      {missing && (
        <p role="status" className={styles.muted}>
          {missing.length === lines.length ? 'None of these items are available right now' : `Added the rest to your bag. Not available right now: ${missing.join(', ')}`}
          .{missing.length < lines.length && (
            <>
              {' '}
              <Link href="/bag">Go to your bag</Link>
            </>
          )}
        </p>
      )}
    </>
  );
}
