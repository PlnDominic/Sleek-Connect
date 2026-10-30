import { statusShort, type OrderStatus } from '@/lib/orders';
import styles from './admin.module.css';

const tones: Partial<Record<OrderStatus, 'good' | 'warn' | 'bad'>> = {
  delivered: 'good',
  pending_payment: 'warn',
  delivery_failed: 'bad',
  cancelled: 'bad',
  returned: 'bad',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={styles.badge} data-tone={tones[status]}>
      {statusShort[status]}
    </span>
  );
}
