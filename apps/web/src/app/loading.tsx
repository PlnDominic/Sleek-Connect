export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" style={{ margin: '0 auto', maxWidth: 720, padding: '96px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--c-accent)', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Sleek Connect Store
      </p>
      <p style={{ color: 'var(--c-text-muted)', marginTop: 20 }}>Loading your store experience…</p>
    </main>
  );
}
