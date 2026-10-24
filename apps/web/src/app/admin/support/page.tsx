import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { topics, type Topic } from '../../help/report/topics';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Support' };

const views = { open: 'Open', answered: 'Answered', closed: 'Closed', all: 'All' } as const;
type View = keyof typeof views;
const tones = { open: 'warn', answered: 'good', closed: undefined } as const;

export default async function SupportPage({ searchParams }: PageProps<'/admin/support'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const view: View = typeof params.view === 'string' && params.view in views ? (params.view as View) : 'open';

  let query = staff.supabase
    .from('support_cases')
    .select('id, case_number, topic, name, phone, status, created_at, order_reference, orders(order_number)')
    .order('created_at', { ascending: view === 'open' })
    .limit(200);
  if (view !== 'all') query = query.eq('status', view);
  const { data: cases, error } = await query;
  if (error) throw error;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Support</h1>
          <p className={styles.muted}>Messages from the help centre. Replies go to the customer by text message and email.</p>
        </div>
      </div>
      <div className={styles.panelHead}>
        <nav className={styles.tabs} aria-label="Filter cases">
          {(Object.keys(views) as View[]).map((key) => (
            <Link key={key} href={`/admin/support?view=${key}`} aria-current={key === view ? 'page' : undefined}>
              {views[key]}
            </Link>
          ))}
        </nav>
      </div>
      <section className={styles.panel}>
        {cases.length === 0 ? (
          <p className={styles.empty}>Nothing here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Case</th>
                  <th scope="col">Received</th>
                  <th scope="col">Topic</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Order</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/support/${c.case_number}`}>{c.case_number}</Link>
                    </td>
                    <td>{formatDateTime(c.created_at)}</td>
                    <td>{topics[c.topic as Topic]}</td>
                    <td>
                      {c.name}
                      <br />
                      <span className={styles.muted}>{c.phone}</span>
                    </td>
                    <td>
                      {c.orders ? (
                        <Link href={`/admin/orders/${c.orders.order_number}`}>{c.orders.order_number}</Link>
                      ) : c.order_reference ? (
                        <span className={styles.muted}>{c.order_reference} (not matched)</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={styles.badge} data-tone={tones[c.status as keyof typeof tones]}>
                        {views[c.status as keyof typeof views]}
                      </span>
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
