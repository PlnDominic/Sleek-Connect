import { statusShort, type OrderStatus } from '@/lib/orders';
import styles from './admin.module.css';

const tones: Partial<Record<OrderStatus, 'good' | 'warn' | 'bad'>> = {
  delivered: 'good',
  pending_payment: 'warn',
  delivery_failed: 'bad',
  cancelled: 'bad',
  returned: 'bad',
};

/**
 * What to call a cancelled order. "Cancelled" alone hides the difference that matters: an order that simply ran out of
 * time to be paid (nothing was taken) is very different from one whose money arrived after it was cancelled.
 */
export function cancelledLabel(cancelReason: string | null | undefined, needsReview: boolean | null | undefined): { label: string; tone: 'good' | 'warn' | 'bad' | undefined; hint: string } {
  if (needsReview) return { label: 'Paid · cancelled', tone: 'bad', hint: 'Payment arrived after the order was cancelled. Refund it, or place the order again for the customer.' };
  if (cancelReason === 'payment_timeout') return { label: 'Expired · unpaid', tone: undefined, hint: 'The customer did not pay in time, so the order was cancelled and its stock released.' };
  if (cancelReason === 'payment_failed') return { label: 'Payment failed', tone: undefined, hint: 'The payment was declined or cancelled, so the order was cancelled and its stock released.' };
  return { label: 'Cancelled', tone: 'bad', hint: cancelReason ? `Cancelled: ${cancelReason}` : 'Cancelled' };
}

export function StatusBadge({ status, cancelReason, needsReview }: { status: OrderStatus; cancelReason?: string | null; needsReview?: boolean | null }) {
  if (status === 'cancelled') {
    const { label, tone, hint } = cancelledLabel(cancelReason, needsReview);
    return (
      <span className={styles.badge} data-tone={tone} title={hint}>
        {label}
      </span>
    );
  }
  return (
    <span className={styles.badge} data-tone={tones[status]}>
      {statusShort[status]}
    </span>
  );
}
