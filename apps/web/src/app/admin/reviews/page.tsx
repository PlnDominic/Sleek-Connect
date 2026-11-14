import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
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
  const reviewParam = typeof params.review === 'string' ? params.review : null;
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
  const open = reviewParam ? reviews.find((r) => r.id === reviewParam) : undefined;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Reviews</h1>
          <p className={styles.muted}>Check each review before it goes live. Reject anything abusive, false or personal.</p>
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

      {open && (
        <section className={styles.panel} aria-label={`Review of ${open.product_name} by ${open.display_name}`}>
          <div className={styles.panelHead}>
            <h2>
              <Link href={`/products/${open.product_slug}#reviews`}>{open.product_name}</Link>
            </h2>
            <Link href={`/admin/reviews?view=${view}`} className={styles.secondary}>
              Close
            </Link>
          </div>
          <p>
            <Stars rating={open.rating} /> <strong>{open.title}</strong>
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{open.body}</p>
          <p className={styles.muted}>
            {open.display_name} · verified purchase · {formatDateTime(open.created_at)}
            {open.edited && ' · edited'}
            {open.moderated_by && ` · ${view === 'published' ? 'approved' : 'rejected'} by ${open.moderated_by}`}
          </p>
          {open.moderation_note && <p className={styles.muted}>Reason given: {open.moderation_note}</p>}
          <ActionForm action={moderateReview.bind(null, open.id, view)}>
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
      )}

      <section className={styles.panel} aria-label="Reviews">
        {reviews.length === 0 ? (
          <p className={styles.empty}>Nothing here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Rating</th>
                  <th>Review</th>
                  <th>By</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/products/${r.product_slug}#reviews`}>
                        <strong>{r.product_name}</strong>
                      </Link>
                    </td>
                    <td>
                      <Stars rating={r.rating} />
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      <strong>{r.title}</strong>
                      <div className={styles.muted}>{r.body.length > 120 ? `${r.body.slice(0, 120)}…` : r.body}</div>
                      {r.moderation_note && <div className={styles.muted}>Reason given: {r.moderation_note}</div>}
                    </td>
                    <td>
                      {r.display_name}
                      {r.edited && <div className={styles.muted}>edited</div>}
                    </td>
                    <td className={styles.muted}>
                      {formatDateTime(r.created_at)}
                      {r.moderated_by && <div>{view === 'published' ? 'approved' : 'rejected'} by {r.moderated_by}</div>}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link href={`/admin/reviews?view=${view}&review=${r.id}`} className={styles.iconButton} title="Read the whole review" aria-label={`Read the review of ${r.product_name} by ${r.display_name}`}>
                          <Icon name="eye" size={16} />
                        </Link>
                        {view !== 'published' && (
                          <ActionForm action={moderateReview.bind(null, r.id, view)}>
                            <button type="submit" name="intent" value="publish" className={styles.secondary} aria-label={`Publish the review of ${r.product_name} by ${r.display_name}`}>
                              Publish
                            </button>
                          </ActionForm>
                        )}
                        {view !== 'rejected' && (
                          <Link href={`/admin/reviews?view=${view}&review=${r.id}`} className={styles.secondary} aria-label={`${view === 'published' ? 'Remove' : 'Reject'} the review of ${r.product_name} by ${r.display_name}`}>
                            {view === 'published' ? 'Remove' : 'Reject'}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
