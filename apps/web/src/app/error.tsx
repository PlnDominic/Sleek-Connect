'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import Link from 'next/link';

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
    // One structured line, shaped like the server logs (P0 item 6).
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'storefront_error',
        message: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '96px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--c-accent)', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Sleek Connect Store
      </p>
      <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1, margin: '16px 0' }}>
        Something went wrong
      </h1>
      <p style={{ color: 'var(--c-text-muted)', lineHeight: 1.7, margin: '0 auto 28px', maxWidth: 520 }}>
        We could not load this page. Please try again, or return to the store if the problem continues.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{ background: 'var(--c-ink)', border: 0, borderRadius: 999, color: 'var(--c-canvas)', cursor: 'pointer', fontWeight: 700, padding: '13px 22px' }}
        >
          Try again
        </button>
        <Link href="/" style={{ border: '1px solid var(--c-line-strong)', borderRadius: 999, color: 'var(--c-ink)', fontWeight: 700, padding: '12px 22px', textDecoration: 'none' }}>
          Back to store
        </Link>
      </div>
    </main>
  );
}
