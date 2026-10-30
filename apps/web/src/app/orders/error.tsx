'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function OrderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'order_page_error',
        message: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '72px 24px', textAlign: 'center' }}>
      <p style={{ color: '#8b5e3c', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your order</p>
      <h1>We could not load this order</h1>
      <p style={{ color: '#5f6368', lineHeight: 1.7 }}>
        Your order has not changed. Try again, or track it again from the help centre.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <button
          type="button"
          onClick={reset}
          style={{ background: '#202124', border: 0, borderRadius: 999, color: '#fff', cursor: 'pointer', fontWeight: 700, padding: '13px 22px' }}
        >
          Try again
        </button>
        <Link href="/track" style={{ border: '1px solid #d8d2ca', borderRadius: 999, color: '#202124', fontWeight: 700, padding: '12px 22px', textDecoration: 'none' }}>
          Track an order
        </Link>
      </div>
    </main>
  );
}
