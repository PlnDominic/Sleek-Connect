import Link from 'next/link';
import type { StoreSetup } from '@/lib/store-setup';
import styles from './vendor.module.css';

/**
 * "Set up your store": a progress bar and the steps still to do, with a button to the next one. Like Etsy's shop setup: you can
 * work on your store while it is being reviewed, and it opens once you are approved and have paid.
 */
export function SetupChecklist({ setup, title = 'Set up your store' }: { setup: StoreSetup; title?: string }) {
  return (
    <section className={styles.panel} aria-labelledby="setup-title">
      <div className={styles.panelHead}>
        <h2 id="setup-title">{title}</h2>
        <strong>
          {setup.done} of {setup.total} done
        </strong>
      </div>
      <div className={styles.progress} role="progressbar" aria-valuenow={setup.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Store setup progress">
        <span style={{ width: `${setup.percent}%` }} />
      </div>
      {setup.next && (
        <p>
          <strong>Next:</strong> {setup.next.title}.{' '}
          <Link href={setup.next.href} className={styles.primary}>
            Go
          </Link>
        </p>
      )}
      <ol className={styles.steps}>
        {setup.steps.map((step) => (
          <li key={step.id} data-done={step.done || undefined} data-locked={step.locked ? true : undefined}>
            <span className={styles.stepMark} aria-hidden="true">
              {step.done ? '✓' : ''}
            </span>
            <span className={styles.stepText}>
              {step.done || step.locked ? (
                <span>{step.title}</span>
              ) : (
                <Link href={step.href}>{step.title}</Link>
              )}
              <small>{step.locked && !step.done ? step.locked : step.hint}</small>
            </span>
            <span className="visually-hidden">{step.done ? 'Done' : step.locked ? 'Not available yet' : 'To do'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
