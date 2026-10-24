'use client';
import { useState } from 'react';
import { reportProductReview } from './actions';
import styles from './reviews.module.css';
export function ReviewReport({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (message) return <span className={styles.muted}>{message}</span>;
  if (!open) return <button type="button" className={styles.link} onClick={() => setOpen(true)}>Report</button>;
  return <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); const reason = String(new FormData(e.currentTarget).get('reason') ?? ''); const result = await reportProductReview(reviewId, reason); setBusy(false); setMessage(result.ok ? 'Thanks. We’ll check this review.' : result.message); }}><input name="reason" placeholder="Why should we check it?" minLength={10} maxLength={500} required /><button type="submit" className={styles.link} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button></form>;
}
