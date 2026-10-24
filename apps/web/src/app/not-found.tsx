import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '96px 24px', textAlign: 'center' }}>
      <p style={{ color: '#8b5e3c', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        404 · Sleek Connect Store
      </p>
      <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1, margin: '16px 0' }}>Page not found</h1>
      <p style={{ color: '#5f6368', lineHeight: 1.7, margin: '0 auto 28px', maxWidth: 520 }}>
        That link may be out of date, or the page may have moved. Browse the latest products from the store.
      </p>
      <Link href="/" style={{ background: '#202124', borderRadius: 999, color: '#fff', display: 'inline-block', fontWeight: 700, padding: '13px 22px', textDecoration: 'none' }}>
        Continue shopping
      </Link>
    </main>
  );
}
