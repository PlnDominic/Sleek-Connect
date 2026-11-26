import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { topics, type Topic } from '../../../help/report/topics';
import { ActionForm } from '../../ActionForm';
import { Flash } from '../../Flash';
import { replyToCase } from '../actions';
import styles from '../../admin.module.css';

export async function generateMetadata({ params }: PageProps<'/admin/support/[case]'>): Promise<Metadata> {
  return { title: `Case ${(await params).case}` };
}

export default async function SupportCasePage({ params, searchParams }: PageProps<'/admin/support/[case]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const [{ case: caseNumber }, { done }] = await Promise.all([params, searchParams]);

  const { data: c, error } = await staff.supabase
    .from('support_cases')
    .select('id, case_number, topic, name, phone, email, message, status, staff_reply, replied_at, replied_by, created_at, order_reference, orders(order_number, status)')
    .eq('case_number', caseNumber)
    .maybeSingle();
  if (error) throw error;
  if (!c) notFound();
  const reply = can(staff.role, 'support.reply');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href="/admin/support">Support</Link>
          </p>
          <h1>
            Case {c.case_number} <span className={styles.badge}>{c.status}</span>
          </h1>
          <p className={styles.muted}>
            {topics[c.topic as Topic]} · received {formatDateTime(c.created_at)}
          </p>
        </div>
      </div>
      <Flash message={done} />

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>Message</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{c.message}</p>
          <dl className={styles.facts}>
            <dt>From</dt>
            <dd>{c.name}</dd>
            <dt>Phone</dt>
            <dd>{c.phone}</dd>
            {c.email && (
              <>
                <dt>Email</dt>
                <dd>{c.email}</dd>
              </>
            )}
            <dt>Order</dt>
            <dd>
              {c.orders ? (
                <Link href={`/admin/orders/${c.orders.order_number}`}>{c.orders.order_number}</Link>
              ) : c.order_reference ? (
                `${c.order_reference} (no order with that number and phone)`
              ) : (
                'None given'
              )}
            </dd>
          </dl>
        </section>

        <section className={styles.panel}>
          <h2>Reply</h2>
          {c.staff_reply && (
            <div>
              <p className={styles.muted}>
                Last reply {c.replied_at && formatDateTime(c.replied_at)} by {c.replied_by ?? 'staff'}:
              </p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{c.staff_reply}</p>
            </div>
          )}
          {reply ? (
            <ActionForm action={replyToCase.bind(null, c.id, c.case_number)} resetOnSuccess>
              <label className={styles.field}>
                <span>Reply to the customer</span>
                <textarea name="reply" rows={5} maxLength={600} placeholder="Sent by text message (and email if they gave one)." />
                <small>Keep it short: it goes out as an SMS.</small>
              </label>
              <div className={styles.buttons}>
                <button type="submit" name="intent" value="reply" className={styles.primary}>
                  Send reply
                </button>
                <button type="submit" name="intent" value="reply_close" className={styles.secondary}>
                  Send and close
                </button>
                {c.status !== 'closed' && (
                  <button type="submit" name="intent" value="close" className={styles.secondary}>
                    Close without replying
                  </button>
                )}
              </div>
            </ActionForm>
          ) : (
            <p className={styles.muted}>Your role can read cases but not reply.</p>
          )}
        </section>
      </div>
    </>
  );
}
