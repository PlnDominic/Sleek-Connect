/** Shown inside the console frame while a page's data arrives: quiet placeholder blocks, no message. */
export default function AdminLoading() {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 16 }}>
      <div style={{ height: 36, width: '32%', borderRadius: 10, background: 'rgb(11 31 58 / 0.06)' }} />
      <div style={{ height: 220, borderRadius: 16, background: 'rgb(11 31 58 / 0.04)' }} />
    </div>
  );
}
