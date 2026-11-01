'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';
import styles from '../admin.module.css';

/** Sends one deliberate error from this browser to Sentry, to check that the browser side of error reporting works. */
export function TestBrowserError() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.secondary}
          onClick={async () => {
            if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
              setMessage('Error reporting isn’t switched on: NEXT_PUBLIC_SENTRY_DSN is not set. Add it in Vercel and redeploy.');
              return;
            }
            Sentry.captureException(new Error('Test error from the admin console (browser). Safe to ignore.'), { tags: { test: 'true', side: 'browser' } });
            const sent = await Sentry.flush(3000);
            setMessage(
              sent
                ? 'Test error sent. It should appear in Sentry → Issues within a minute, titled “Test error from the admin console (browser)”.'
                : 'The report could not be sent. An ad blocker or a network rule may be blocking sentry.io.',
            );
          }}
        >
          Send a browser test error
        </button>
      </div>
      {message && (
        <p role="status" className={styles.muted}>
          {message}
        </p>
      )}
    </>
  );
}
