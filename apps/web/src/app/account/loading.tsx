export default function AccountLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{ margin: '0 auto', maxWidth: 720, padding: '72px 24px', textAlign: 'center' }}
    >
      <p style={{ color: 'var(--c-accent)', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Your account
      </p>
      <p style={{ color: 'var(--c-text-muted)', marginTop: 20 }}>Loading your account…</p>
    </div>
  );
}
