'use client';
import { useState, type FormEvent } from 'react';
import { subscribeStockAlert } from './actions';
import styles from './product.module.css';
export function RestockAlert({ slug }: { slug: string }) {
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setBusy(true); const email = String(new FormData(e.currentTarget).get('email') ?? ''); const result = await subscribeStockAlert(slug, email); setBusy(false); setMessage(result.ok ? 'We’ll email you when it’s back in stock.' : result.message); if (result.ok) e.currentTarget.reset(); };
  return <form onSubmit={submit} className={styles.serviceBox} aria-label="Get a restock alert"><strong>Sold out? Get a restock alert</strong><p className={styles.muted}>We’ll only use your email for this product availability update.</p><div className={styles.buyRow}><input name="email" type="email" required placeholder="you@example.com" aria-label="Email address" /><button className={styles.addButton} disabled={busy}>{busy ? 'Saving…' : 'Notify me'}</button></div>{message && <p role="status" className={styles.muted}>{message}</p>}</form>;
}
