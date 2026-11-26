'use client';

import Link from 'next/link';
import { useActionState, useTransition, type FormEvent } from 'react';
import { sendReport, type ReportState } from './actions';
import { topics, type Topic } from './topics';
import styles from '../help.module.css';

export interface ReportDefaults {
  token?: string;
  orderNumber?: string;
  name?: string;
  phone?: string;
  topic?: Topic;
}

export function ReportForm({ defaults }: { defaults: ReportDefaults }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(sendReport, null);
  const [, startTransition] = useTransition();
  // Submit through a transition so a refused message keeps what was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };

  if (state?.ok) {
    return (
      <section className={styles.done} role="status">
        <h2>Message sent</h2>
        <span>Your case number</span>
        <span className={styles.caseNumber}>{state.caseNumber}</span>
        <p>Keep this number. We’ll reply by text message{defaults.token ? '' : ' or email'} as soon as we can.</p>
        {defaults.token ? (
          <Link href={`/orders/${defaults.token}`} className={styles.secondary}>
            Back to your order
          </Link>
        ) : (
          <Link href="/help" className={styles.secondary}>
            Back to the help centre
          </Link>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submit} className={`${styles.panel} ${styles.form}`}>
      <fieldset disabled={pending} className={styles.fieldset}>
        {defaults.token && <input type="hidden" name="order_token" value={defaults.token} />}
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            What is it about?
            <select name="topic" required defaultValue={defaults.topic ?? ''}>
              <option value="" disabled>
                Choose a topic
              </option>
              {Object.entries(topics).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>
              Order number <span className={styles.optional}>(if it’s about an order)</span>
            </span>
            <input
              name="order_number"
              defaultValue={defaults.orderNumber}
              readOnly={Boolean(defaults.token)}
              placeholder="SC-1234"
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            Your name
            <input name="name" required maxLength={120} autoComplete="name" defaultValue={defaults.name} />
          </label>
          <label className={styles.field}>
            Phone number
            <input name="phone" type="tel" required autoComplete="tel" defaultValue={defaults.phone} />
            <small>We’ll reply here. For an order, use the number you checked out with.</small>
          </label>
          <label className={styles.field}>
            <span>
              Email <span className={styles.optional}>(optional)</span>
            </span>
            <input name="email" type="email" autoComplete="email" />
          </label>
        </div>
        <label className={styles.field}>
          Message
          <textarea name="message" required maxLength={2000} placeholder="Tell us what happened and how we can help." />
        </label>
        <button type="submit" className={styles.primary}>
          {pending ? 'Sending…' : 'Send message'}
        </button>
      </fieldset>
      {state && !state.ok && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
    </form>
  );
}
