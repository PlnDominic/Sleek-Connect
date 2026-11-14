'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Stars } from '@/components/Stars';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { deleteReview, submitReview } from './actions';
import styles from './reviews.module.css';

interface Mine {
  canReview: boolean;
  review: { rating: number; title: string | null; body: string; status: 'pending' | 'published' | 'rejected'; note: string | null } | null;
}

/** "Write a review" for signed-in customers who received this product; shows the state of their own review. */
export function ReviewForm({ slug }: { slug: string }) {
  const { user, loading } = useAuth();
  const id = useId();
  const [mine, setMine] = useState<Mine | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    createBrowserSupabase()
      .rpc('my_review_status', { p_slug: slug })
      .then(({ data }) => {
        const row = data?.[0];
        if (cancelled || !row) return;
        setMine({
          canReview: row.can_review,
          review: row.review_id
            ? { rating: row.rating, title: row.title, body: row.body, status: row.status, note: row.moderation_note }
            : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, slug]);

  if (loading) return null;
  if (!user) {
    return (
      <p className={styles.muted}>
        <Link href={`/account?next=${encodeURIComponent(`/products/${slug}`)}`}>Sign in</Link> to review this product if you have received it.
      </p>
    );
  }
  if (!mine) return null;
  if (!mine.canReview) {
    return <p className={styles.muted}>Only customers who have received this product can review it.</p>;
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    const body = String(form.get('body') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const result = await submitReview(slug, rating, title, body);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    setMine({ canReview: true, review: { rating, title: title || null, body, status: 'pending', note: null } });
    setEditing(false);
    setMessage({ ok: true, text: 'Thank you! Your review will appear once our team has checked it.' });
  };

  const remove = async () => {
    if (!window.confirm('Delete your review?')) return;
    setBusy(true);
    const result = await deleteReview(slug);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    setMine({ canReview: true, review: null });
    setMessage(null);
  };

  const existing = mine.review;
  if (existing && !editing) {
    const labels = { pending: 'Waiting to be checked', published: 'Published', rejected: 'Not published' } as const;
    return (
      <div className={styles.mine} aria-label="Your review">
        <strong>Your review</strong>
        <span>
          <Stars rating={existing.rating} /> <span className={styles.status}>{labels[existing.status]}</span>
        </span>
        {existing.title && <strong>{existing.title}</strong>}
        <p>{existing.body}</p>
        {existing.status === 'rejected' && existing.note && <p className={styles.rejected}>Our team said: {existing.note}</p>}
        {message && (
          <p role="status" className={styles.success}>
            {message.text}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setRating(existing.rating);
              setEditing(true);
              setMessage(null);
            }}
          >
            Edit
          </button>
          <button type="button" className={styles.link} disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={save} aria-label="Write a review">
      <strong>{existing ? 'Edit your review' : 'Write a review'}</strong>
      <fieldset className={styles.rating}>
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={n <= rating ? styles.starOn : styles.starOff}>
            <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} required />
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">{n} {n === 1 ? 'star' : 'stars'}</span>
          </label>
        ))}
      </fieldset>
      <label className={styles.field} htmlFor={`${id}-title`}>
        Title <span className={styles.muted}>(optional)</span>
        <input id={`${id}-title`} name="title" maxLength={80} defaultValue={existing?.title ?? ''} />
      </label>
      <label className={styles.field} htmlFor={`${id}-body`}>
        Your review
        <textarea id={`${id}-body`} name="body" rows={5} required minLength={10} maxLength={2000} defaultValue={existing?.body ?? ''} />
      </label>
      <p className={styles.muted}>We show your first name and the first letter of your last name. Reviews are checked before they appear.</p>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || rating === 0}>
          {busy ? 'Saving…' : 'Submit review'}
        </button>
        {existing && (
          <button type="button" className={styles.link} onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>
          {message.text}
        </p>
      )}
    </form>
  );
}
