'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GH">
      <body style={{ margin: 0 }}>
        <main style={{ margin: '0 auto', maxWidth: 720, padding: '96px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'system-ui, sans-serif', color: '#8b5e3c', fontWeight: 700 }}>Sleek Connect Store</p>
          <h1 style={{ fontFamily: 'system-ui, sans-serif' }}>We are having trouble loading the store</h1>
          <p style={{ color: '#5f6368', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7 }}>
            Please try again. If this continues, contact support and let us know what you were trying to do.
          </p>
          <button type="button" onClick={() => reset()} style={{ background: '#202124', border: 0, borderRadius: 999, color: '#fff', cursor: 'pointer', fontWeight: 700, padding: '13px 22px' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
