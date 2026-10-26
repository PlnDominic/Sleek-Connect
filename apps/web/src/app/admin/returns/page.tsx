import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPriceOr } from '@sleek/shared';
import { requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, returnReasons, type ReturnReason, type ReturnStatus } from '@/lib/orders';
import { returnStatusShort, returnTones } from './labels';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Returns' };

const views = {
  requested: 'To review',
  approved: 'Awaiting item',
  received: 'Refund due',
  refunded: 'Refunded',
  rejected: 'Declined',
  all: 'All',
} as const;
type View = keyof typeof views;

export default async function ReturnsPage({ searchParams }: PageProps<'/admin/returns'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const view: View = typeof params.view === 'string' && params.view in views ? (params.view as View) : 'requested';

  let query = staff.supabase
    .from('return_requests')
    .select('id, case_number, status, reason, created_at, refund_amount_ghs, photo_paths, orders(order_number, customer_name, phone), return_items(quantity)')
    .order('created_at', { ascending: view !== 'all' && view !== 'refunded' && view !== 'rejected' })
    .limit(200);
  if (view !== 'all') query = query.eq('status', view);
  const { data: returns, error } = await query;
  if (error) throw error;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Returns</h1>
          <p className={styles.muted}>Oldest first.</p>
        </div>
      </div>
      <div className={styles.panelHead}>
        <nav className={styles.tabs} aria-label="Filter returns">
          {(Object.keys(views) as View[]).map((key) => (
            <Link key={key} href={`/admin/returns?view=${key}`} aria-current={key === view ? 'page' : undefined}>
              {views[key]}
            </Link>
          ))}
        </nav>
      </div>
      <section className={styles.panel}>
        {returns.length === 0 ? (
          <p className={styles.empty}>Nothing here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Return</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Reason</th>
                  <th scope="col" className={styles.num}>Refund</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => {
                  const status = r.status as ReturnStatus;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/returns/${r.case_number}`}>{r.case_number}</Link>
                        <div className={styles.muted}>
                          {formatDateTime(r.created_at)}
                          {r.orders && (
                            <>
                              {' · '}
                              <Link href={`/admin/orders/${r.orders.order_number}`}>{r.orders.order_number}</Link>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{r.orders?.customer_name}</strong>
                        <div className={styles.muted}>{r.orders?.phone}</div>
                      </td>
                      <td>
                        {returnReasons[r.reason as ReturnReason]}
                        <div className={styles.muted}>
                          {r.return_items.reduce((n, i) => n + i.quantity, 0)} item{r.return_items.reduce((n, i) => n + i.quantity, 0) === 1 ? '' : 's'}
                          {r.photo_paths.length > 0 && ` · ${r.photo_paths.length} photo${r.photo_paths.length === 1 ? '' : 's'}`}
                        </div>
                      </td>
                      <td className={styles.num}>
                        <strong>{r.refund_amount_ghs === null ? '—' : formatPriceOr(r.refund_amount_ghs, '—')}</strong>
                      </td>
                      <td>
                        <span className={styles.badge} data-tone={returnTones[status]}>
                          {returnStatusShort[status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
