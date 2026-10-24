import type { Metadata } from 'next';
import Link from 'next/link';
import { Stars } from '@/components/Stars';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { Flash } from '../Flash';
import { moderateReview } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Reviews' };

const views = { pending: 'To review', published: 'Published', rejected: 'Rejected' } as const;
type View = keyof typeof views;

export default async function ReviewsPage({ searchParams }: PageProps<'/admin/reviews'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const view: View = typeof params.view === 'string' && params.view in views ? (params.view as View) : 'pending';

  if (!can(staff.role, 'reviews.moderate')) {
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Reviews</h1>
        </div>
        <p className={styles.muted}>Only catalogue, support and admin staff can moderate reviews.</p>
      </>
    );
  }

  const [{ data: reviews, error }, { data: counts }] = await Promise.all([
    staff.supabase.rpc('admin_list_reviews', { p_status: view }),
    staff.supabase.rpc('admin_review_counts').maybeSingle(),
  ]);
  if (error) throw error;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Reviews</h1>
          <p className={styles.muted}>
            Only customers who received a product can review it. Check each review before it appears on the product page: reject
            anything abusive, off topic, false, or that shares personal details.
          </p>
        </div>
      </div>
      <Flash message={params.done} />
      <div className={styles.panelHead}>
        <nav className={styles.tabs} aria-label="Filter reviews">
          {(Object.keys(views) as View[]).map((key) => (
            <Link key={key} href={`/admin/reviews?view=${key}`} aria-current={key === view ? 'page' : undefined}>
              {views[key]}
              {counts && ` (${counts[key]})`}
            </Link>
          ))}
        </nav>
      </div>
      {reviews.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.empty}>Nothing here.</p>
        </section>
      ) : (
        reviews.map((r) => (
          <section key={r.id} className={styles.panel} aria-label={`Review of ${r.product_name} by ${r.display_name}`}>
            <h2>
              <Link href={`/products/${r.product_slug}#reviews`}>{r.product_name}</Link>
            </h2>
            <p>
              <Stars rating={r.rating} /> <strong>{r.title}</strong>
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
            <p className={styles.muted}>
              {r.display_name} · verified purchase · {formatDateTime(r.created_at)}
              {r.edited && ' · edited'}
              {r.moderated_by && ` · ${view === 'published' ? 'approved' : 'rejected'} by ${r.moderated_by}`}
            </p>
            {r.moderation_note && <p className={styles.muted}>Reason given: {r.moderation_note}</p>}
            <ActionForm action={moderateReview.bind(null, r.id, view)}>
              <label className={styles.field}>
                <span>Reason (needed to reject; the customer sees it)</span>
                <input name="note" maxLength={300} placeholder="For example: please describe the product itself." />
              </label>
              <div className={styles.buttons}>
                {view !== 'published' && (
                  <button type="submit" name="intent" value="publish" className={styles.primary}>
                    Publish
                  </button>
                )}
                {view !== 'rejected' && (
                  <button type="submit" name="intent" value="reject" className={styles.secondary}>
                    {view === 'published' ? 'Remove from the store' : 'Reject'}
                  </button>
                )}
              </div>
            </ActionForm>
          </section>
        ))
      )}
    </>
  );
}
