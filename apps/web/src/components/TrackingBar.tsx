import { trackingProgress, trackingStages } from '@/lib/tracking';
import type { OrderStatus } from '@/lib/orders';
import styles from './tracking.module.css';

/** Confirmed → Packed → On the way → Delivered, with the current step highlighted. */
export function TrackingBar({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  const p = trackingProgress(status);
  return (
    <div className={compact ? styles.compact : styles.bar} data-problem={p.problem ? true : undefined}>
      <ol aria-label="Delivery progress">
        {trackingStages.map((label, i) => {
          const state = i < p.done ? 'done' : i === p.current ? 'current' : 'upcoming';
          return (
            <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className={styles.label}>
                {label}
                <span className="visually-hidden">{state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {p.problem && !compact && <p className={styles.problem}>{p.problem}</p>}
    </div>
  );
}
