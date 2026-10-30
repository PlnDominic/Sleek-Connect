export default function AdminLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      style={{ padding: '72px 24px', textAlign: 'center' }}
    >
      <p style={{ color: '#8b5e3c', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Staff console</p>
      <p style={{ color: '#5f6368', marginTop: 20 }}>Loading your workspace…</p>
    </main>
  );
}
