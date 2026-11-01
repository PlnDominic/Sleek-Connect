import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Stars } from '@/components/Stars';
import { getVendorSession } from '@/lib/vendor';
import { replyToReview } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Reviews' };

interface VendorReview {
  id: string;
  product_name: string;
  product_slug: string;
  rating: number;
  title: string | null;
  body: string;
  display_name: string;
  created_at: string;
  seller_reply: string | null;
}

const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });

export default async function VendorReviewsPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_reviews');
  if (error) throw error;
  const reviews = (data as unknown as VendorReview[]) ?? [];
  const waiting = reviews.filter((r) => !r.seller_reply).length;

  return (
    <>
      <p className={styles.lead}>
        Shoppers review products after they receive them. A short, kind reply, in public, shows other shoppers you care, whether the review is glowing or not.
        Replies are visible on the product page and your store page; we may remove one that is rude or shares personal details.
      </p>
      {reviews.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.muted}>No reviews yet. They appear here once shoppers who received your products write them.</p>
        </section>
      ) : (
        <>
          <p className={styles.muted}>
            {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'} · {waiting === 0 ? 'all replied to' : `${waiting} without a reply`}
          </p>
          {reviews.map((r) => (
            <section key={r.id} className={styles.panel} aria-label={`Review of ${r.product_name}`}>
              <div className={styles.panelHead}>
                <h2>
                  <Link href={`/products/${r.product_slug}#reviews`}>{r.product_name}</Link>
                </h2>
                <Stars rating={r.rating} />
              </div>
              {r.title && <strong>{r.title}</strong>}
              <p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
              <p className={styles.muted}>
                {r.display_name} · {dateText(r.created_at)}
              </p>
              <VendorForm action={replyToReview.bind(null, r.id)}>
                <label className={styles.field}>
                  <span>{r.seller_reply ? 'Your reply' : 'Reply to this review'}</span>
                  <textarea name="reply" rows={3} maxLength={1000} defaultValue={r.seller_reply ?? ''} />
                  {r.seller_reply && <small>Clear the box and save to remove your reply.</small>}
                </label>
                <div className={styles.buttons}>
                  <button type="submit" className={styles.secondary}>
                    {r.seller_reply ? 'Save reply' : 'Post reply'}
                  </button>
                </div>
              </VendorForm>
            </section>
          ))}
        </>
      )}
    </>
  );
}
