'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Structured so the browser console reads the same way as the server logs.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'account_error',
        message: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '72px 24px', textAlign: 'center' }}>
      <p style={{ color: '#8b5e3c', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your account</p>
      <h1>We could not load your account</h1>
      <p style={{ color: '#5f6368', lineHeight: 1.7 }}>Nothing was changed. Try again, or return to the store.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <button
          type="button"
          onClick={reset}
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
