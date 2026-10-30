import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { sendTestEmail } from '../settings/actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Notifications' };

type NotificationStatus = 'all' | 'queued' | 'sending' | 'sent' | 'failed' | 'not_sent';
const statuses: NotificationStatus[] = ['all', 'queued', 'sending', 'sent', 'failed', 'not_sent'];

export default async function NotificationsPage({ searchParams }: PageProps<'/admin/notifications'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const requested = typeof params.status === 'string' ? params.status : 'all';
  const status: NotificationStatus = statuses.includes(requested as NotificationStatus) ? (requested as NotificationStatus) : 'all';
  let query = staff.supabase
    .from('notifications')
    .select('id, template, channel, recipient, status, attempts, next_attempt_at, provider, provider_reference, last_error, created_at, sent_at, orders(order_number)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  const notifications = data ?? [];
  const failed = notifications.filter((item) => item.status === 'failed' || item.status === 'not_sent');
  const pending = notifications.filter((item) => item.status === 'queued' || item.status === 'sending');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Notifications</h1>
          <p className={styles.muted}>SMS and email delivery. Failed messages retry up to five times.</p>
        </div>
        <a className={styles.secondary} href={`/admin/notifications/export?status=${status}`} download>Export CSV</a>
      </div>
      <section className={styles.cards} aria-label="Notification queue summary">
        <Summary label="Shown" value={String(notifications.length)} />
        <Summary label="Pending" value={String(pending.length)} tone={pending.length > 0 ? 'warn' : undefined} />
        <Summary label="Failed or not sent" value={String(failed.length)} tone={failed.length > 0 ? 'bad' : undefined} />
      </section>
      {can(staff.role, 'settings.edit') && (
        <ActionForm action={sendTestEmail}>
          <section className={styles.panel} aria-label="Send a test email">
            <h2>Test the email sender</h2>
            <p className={styles.muted}>Sends one message through the store&apos;s email provider (Gmail), so you can see that emails will reach people.</p>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Send a test email to</span>
                <input name="to" type="email" required defaultValue={staff.email ?? ''} />
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" className={styles.secondary}>
                Send test email
              </button>
            </div>
          </section>
        </ActionForm>
      )}
      <nav className={styles.tabs} aria-label="Notification status">
        {statuses.map((item) => (
          <Link key={item} href={`/admin/notifications?status=${item}`} aria-current={item === status ? 'page' : undefined}>
            {item === 'all' ? 'All' : item.replace('_', ' ')}
          </Link>
        ))}
      </nav>
      <section className={styles.panel} aria-label={`${status} notifications`}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Created</th><th>Order</th><th>Template</th><th>Channel</th><th>Recipient</th><th>Attempts</th><th>Status</th><th>Last error</th></tr></thead>
            <tbody>
              {notifications.map((item) => (
                <tr key={item.id} data-alert={item.status === 'failed' || item.status === 'not_sent' || undefined}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.orders?.order_number ? <Link href={`/admin/orders/${item.orders.order_number}`}>{item.orders.order_number}</Link> : '–'}</td>
                  <td>{item.template}</td>
                  <td>{item.channel}</td>
                  <td><code>{item.recipient}</code></td>
                  <td>{item.attempts}</td>
                  <td><span className={styles.badge} data-tone={item.status === 'sent' ? 'good' : item.status === 'failed' || item.status === 'not_sent' ? 'bad' : 'warn'}>{item.status}</span></td>
                  <td>{item.last_error ?? (item.status === 'queued' ? `Next attempt ${formatDateTime(item.next_attempt_at)}` : '–')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {notifications.length === 0 && <p className={styles.empty}>No notifications match this filter.</p>}
        </div>
      </section>
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  return <div className={styles.card} data-alert={tone ? 'true' : undefined}><span className={styles.muted}>{label}</span><strong>{value}</strong></div>;
}
