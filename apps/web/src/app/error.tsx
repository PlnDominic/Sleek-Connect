'use client';

import { useEffect } from 'react';
import Link from 'next/link';

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('Unhandled storefront error', error);
  }, [error]);

  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '96px 24px', textAlign: 'center' }}>
      <p style={{ color: '#8b5e3c', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Sleek Connect Store
      </p>
      <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1, margin: '16px 0' }}>
        Something went wrong
      </h1>
      <p style={{ color: '#5f6368', lineHeight: 1.7, margin: '0 auto 28px', maxWidth: 520 }}>
        We could not load this page. Please try again, or return to the store if the problem continues.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{ background: '#202124', border: 0, borderRadius: 999, color: '#fff', cursor: 'pointer', fontWeight: 700, padding: '13px 22px' }}
        >
          Try again
        </button>
        <Link href="/" style={{ border: '1px solid #d8d2ca', borderRadius: 999, color: '#202124', fontWeight: 700, padding: '12px 22px', textDecoration: 'none' }}>
          Back to store
        </Link>
      </div>
    </main>
  );
}
