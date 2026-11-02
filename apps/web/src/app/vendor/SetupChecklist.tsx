import Link from 'next/link';
import type { StoreSetup } from '@/lib/store-setup';
import styles from './vendor.module.css';

/**
 * "Set up your store": a progress ring, the next step as a call to action, the steps still to do as cards, and the finished
 * ones folded away. Like Etsy's shop setup: you can work on your store while it is being reviewed, and it opens once you are
 * approved and have paid.
 */
export function SetupChecklist({ setup, title = 'Set up your store' }: { setup: StoreSetup; title?: string }) {
  const todo = setup.steps.filter((s) => !s.done);
  const done = setup.steps.filter((s) => s.done);
  return (
    <section className={`${styles.panel} ${styles.setup}`} aria-labelledby="setup-title">
      <div className={styles.setupHead}>
        <div
          className={styles.ring}
          style={{ '--pct': `${setup.percent}%` } as React.CSSProperties}
          role="progressbar"
          aria-valuenow={setup.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Store setup progress"
        >
          <span>{setup.percent}%</span>
        </div>
        <div className={styles.setupIntro}>
          <h2 id="setup-title">{title}</h2>
          <p className={styles.muted}>
            {setup.done} of {setup.total} done. {todo.length === 0 ? 'Everything is in place.' : 'Stores with a full profile sell more.'}
          </p>
        </div>
        {setup.next && (
          <Link href={setup.next.href} className={styles.primary}>
            {setup.next.title}
          </Link>
        )}
      </div>

      {todo.length > 0 && (
        <ol className={styles.todo}>
          {todo.map((step) => (
            <li key={step.id} data-locked={step.locked ? true : undefined} data-next={setup.next?.id === step.id || undefined}>
              <span className={styles.stepMark} aria-hidden="true" />
              <span className={styles.stepText}>
                {step.locked ? <span>{step.title}</span> : <Link href={step.href}>{step.title}</Link>}
                <small>{step.locked ?? step.hint}</small>
              </span>
              <span className="visually-hidden">{step.locked ? 'Not available yet' : 'To do'}</span>
            </li>
          ))}
        </ol>
      )}

      {done.length > 0 && (
        <details className={styles.doneSteps}>
          <summary>
            {done.length} completed {done.length === 1 ? 'step' : 'steps'}
          </summary>
          <ol className={styles.steps}>
            {done.map((step) => (
              <li key={step.id} data-done>
                <span className={styles.stepMark} aria-hidden="true">
                  ✓
                </span>
                <span className={styles.stepText}>
                  <span>{step.title}</span>
                </span>
                <span className="visually-hidden">Done</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
