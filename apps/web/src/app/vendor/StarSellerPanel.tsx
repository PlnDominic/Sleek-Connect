import styles from './vendor.module.css';

export interface StarStatus {
  star: boolean;
  followers: number;
  orders: { value: number; needed: number; met: boolean };
  rating: { value: number; reviews: number; needed: number; reviews_needed: number; met: boolean };
  disputes: { value: number; met: boolean };
}

/** Star Seller progress, like Etsy's: three simple rules, and which of them the store meets today. */
export function StarSellerPanel({ status }: { status: StarStatus }) {
  const rules = [
    { ok: status.orders.met, text: `${status.orders.needed} delivered orders`, now: `${status.orders.value} so far` },
    {
      ok: status.rating.met,
      text: `${status.rating.reviews_needed}+ reviews averaging ${status.rating.needed} or better`,
      now: status.rating.reviews > 0 ? `${status.rating.reviews} ${status.rating.reviews === 1 ? 'review' : 'reviews'}, ${Number(status.rating.value).toFixed(1)} average` : 'no reviews yet',
    },
    { ok: status.disputes.met, text: 'No dispute decided against you, or left unanswered, in 90 days', now: status.disputes.met ? 'clear' : `${status.disputes.value} to sort out` },
  ];
  return (
    <section className={styles.panel} aria-labelledby="star-title">
      <div className={styles.panelHead}>
        <h2 id="star-title">{status.star ? '★ You are a Star Seller' : 'Become a Star Seller'}</h2>
        <strong className={styles.followers}>
          {status.followers} {status.followers === 1 ? 'follower' : 'followers'}
        </strong>
      </div>
      <p className={styles.muted}>
        {status.star ? 'Shoppers see the badge on your store and products. Keep it up.' : 'Stores that meet all three rules get a badge on their store page and products.'}
      </p>
      <ul className={styles.rules}>
        {rules.map((r) => (
          <li key={r.text} data-met={r.ok || undefined}>
            <span className={styles.ruleMark} aria-hidden="true">
              {r.ok ? '✓' : ''}
            </span>
            <span className={styles.stepText}>
              <span>{r.text}</span>
              <small>{r.now}</small>
            </span>
            <span className="visually-hidden">{r.ok ? 'Met' : 'Not met yet'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
