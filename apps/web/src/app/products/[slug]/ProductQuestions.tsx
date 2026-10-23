'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import type { ProductQuestion } from '@/lib/reviews';
import { askProductQuestion } from './actions';
import styles from './reviews.module.css';
export function ProductQuestions({ slug, questions }: { slug: string; questions: ProductQuestion[] }) {
  const { user } = useAuth(); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setBusy(true); const question = String(new FormData(e.currentTarget).get('question') ?? ''); const result = await askProductQuestion(slug, question); setBusy(false); setMessage(result.ok ? 'Thanks — your question is waiting for an answer.' : result.message); if (result.ok) e.currentTarget.reset(); };
  return <section id="questions" className={`container ${styles.section}`} aria-labelledby="questions-title"><h2 id="questions-title" className={styles.title}>Questions & answers</h2>{questions.length ? <ul className={styles.list}>{questions.map((q) => <li key={q.id} className={styles.review}><strong>Q: {q.question}</strong>{q.answer && <p className={styles.body}>A: {q.answer}</p>}</li>)}</ul> : <p className={styles.muted}>No questions yet. Ask the first one.</p>}{user ? <form className={styles.form} onSubmit={submit}><label className={styles.field}>Your question<textarea name="question" rows={3} minLength={10} maxLength={500} required /></label><button className={styles.primary} disabled={busy}>{busy ? 'Sending…' : 'Ask a question'}</button>{message && <p role="status" className={styles.muted}>{message}</p>}</form> : <p className={styles.muted}><Link href={`/account?next=${encodeURIComponent(`/products/${slug}#questions`)}`}>Sign in</Link> to ask a question.</p>}</section>;
}
