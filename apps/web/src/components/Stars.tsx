/** A star rating as text, with the number said once for screen readers. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const whole = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className={className} style={{ color: 'var(--c-accent)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
      {'★'.repeat(whole)}
      <span style={{ color: 'var(--c-line-strong)' }}>{'★'.repeat(5 - whole)}</span>
    </span>
  );
}
