'use client';

import Link from 'next/link';

export default function CheckoutError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" style={{ margin: '0 auto', maxWidth: 720, padding: '72px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--c-accent)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Checkout</p>
      <h1>We could not load checkout</h1>
      <p style={{ color: 'var(--c-text-muted)', lineHeight: 1.7 }}>Your bag is safe. Try again, or return to your bag to review the items before continuing.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <button type="button" onClick={reset} style={{ background: 'var(--c-ink)', border: 0, borderRadius: 999, color: 'var(--c-canvas)', cursor: 'pointer', fontWeight: 700, padding: '13px 22px' }}>Try again</button>
        <Link href="/bag" style={{ border: '1px solid var(--c-line-strong)', borderRadius: 999, color: 'var(--c-ink)', fontWeight: 700, padding: '12px 22px', textDecoration: 'none' }}>Review bag</Link>
      </div>
    </main>
  );
}
