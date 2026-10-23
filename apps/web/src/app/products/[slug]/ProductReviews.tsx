import { Stars } from '@/components/Stars';
import type { Review, ReviewSummary } from '@/lib/reviews';
import { ReviewForm } from './ReviewForm';
import styles from './reviews.module.css';

const date = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' });

/** Customer reviews: the summary, each published review, and the form for people who received the product. */
export function ProductReviews({ slug, summary, reviews }: { slug: string; summary: ReviewSummary; reviews: Review[] }) {
  return (
    <section id="reviews" className={`container ${styles.section}`} aria-labelledby="reviews-title">
      <h2 id="reviews-title" className={styles.title}>
        Customer reviews
      </h2>
      <div className={styles.layout}>
        <div className={styles.summary}>
          {summary.count > 0 ? (
            <>
              <div className={styles.average}>
                <strong>{summary.average.toFixed(1)}</strong>
                <Stars rating={summary.average} />
                <span className={styles.muted}>
                  {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
                </span>
              </div>
              <ul className={styles.bars} aria-label="Reviews by rating">
                {[5, 4, 3, 2, 1].map((n) => (
                  <li key={n}>
                    <span>{n} star</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${(summary.stars[n - 1]! / summary.count) * 100}%` }} />
                    </span>
                    <span className={styles.muted}>{summary.stars[n - 1]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.muted}>No reviews yet.</p>
          )}
          <ReviewForm slug={slug} />
        </div>
        <ul className={styles.list}>
          {reviews.map((r) => (
            <li key={r.id} className={styles.review}>
              <div className={styles.reviewHead}>
                <Stars rating={r.rating} />
                {r.title && <strong>{r.title}</strong>}
              </div>
              <p className={styles.body}>{r.body}</p>
              <span className={styles.muted}>
                {r.displayName} · Verified purchase · {date.format(new Date(r.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
