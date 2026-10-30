export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" style={{ margin: '0 auto', maxWidth: 720, padding: '96px 24px', textAlign: 'center' }}>
      <p style={{ color: '#8b5e3c', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Sleek Connect Store
      </p>
      <p style={{ color: '#5f6368', marginTop: 20 }}>Loading your store experience…</p>
    </main>
  );
}
