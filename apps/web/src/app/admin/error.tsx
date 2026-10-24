'use client';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '72px 24px', textAlign: 'center' }}>
      <p style={{ color: '#8b5e3c', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Staff console</p>
      <h1>We could not load this workspace</h1>
      <p style={{ color: '#5f6368', lineHeight: 1.7 }}>The issue has been recorded. Retry the page, and contact an administrator if it continues.</p>
      <button type="button" onClick={reset} style={{ background: '#202124', border: 0, borderRadius: 999, color: '#fff', cursor: 'pointer', fontWeight: 700, marginTop: 24, padding: '13px 22px' }}>Try again</button>
    </main>
  );
}
