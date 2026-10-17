import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPriceOr } from '@sleek/shared';
import { requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, type OrderStatus } from '@/lib/orders';
import { StatusBadge } from './StatusBadge';
import styles from './admin.module.css';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const db = staff.supabase;
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const orders = () => db.from('orders').select('id', { count: 'exact', head: true });

  const [toPack, ready, out, failed, review, refunds, returnsToReview, returnRefunds, openCases, stock, expiring, recent] = await Promise.all([
    count(orders().in('status', ['paid', 'packing'])),
    count(orders().eq('status', 'packed')),
    count(orders().eq('status', 'out_for_delivery')),
    count(orders().eq('status', 'delivery_failed')),
    count(orders().eq('needs_review', true)),
    count(orders().eq('refund_due', true)),
    count(db.from('return_requests').select('id', { count: 'exact', head: true }).eq('status', 'requested')),
    count(db.from('return_requests').select('id', { count: 'exact', head: true }).eq('status', 'received')),
    count(db.from('support_cases').select('id', { count: 'exact', head: true }).eq('status', 'open')),
    db.rpc('admin_stock_overview'),
    db.rpc('admin_expiring_batches'),
    db.from('orders').select('order_number, status, customer_name, total_ghs, created_at').order('created_at', { ascending: false }).limit(8),
  ]);
  const low = (stock.data ?? []).filter((l) => l.is_low);

  const cards = [
    { label: 'To pack', value: toPack, href: '/admin/orders?view=to_pack' },
    { label: 'Ready for dispatch', value: ready, href: '/admin/orders?view=ready' },
    { label: 'Out for delivery', value: out, href: '/admin/orders?view=out' },
    { label: 'Delivery failed', value: failed, href: '/admin/orders?view=failed', alert: failed > 0 },
    { label: 'Needs review', value: review, href: '/admin/orders?view=review', alert: review > 0 },
    { label: 'Refunds due', value: refunds, href: '/admin/orders?view=refund', alert: refunds > 0 },
    { label: 'Returns to review', value: returnsToReview, href: '/admin/returns', alert: returnsToReview > 0 },
    { label: 'Return refunds due', value: returnRefunds, href: '/admin/returns?view=received', alert: returnRefunds > 0 },
    { label: 'Open support cases', value: openCases, href: '/admin/support', alert: openCases > 0 },
    { label: 'Low stock', value: low.length, href: '/admin/inventory?show=low', alert: low.length > 0 },
    { label: 'Expiry alerts', value: (expiring.data ?? []).length, href: '/admin/inventory', alert: (expiring.data ?? []).length > 0 },
  ];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Dashboard</h1>
          <p className={styles.muted}>What needs doing today.</p>
        </div>
      </div>
      <div className={styles.cards}>
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className={styles.card} data-alert={c.alert || undefined}>
            <span className={styles.muted}>{c.label}</span>
            <strong>{c.value}</strong>
          </Link>
        ))}
      </div>
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="recent-title">
          <h2 id="recent-title">Latest orders</h2>
          <table className={styles.table}>
            <tbody>
              {(recent.data ?? []).map((o) => (
                <tr key={o.order_number}>
                  <td>
                    <Link href={`/admin/orders/${o.order_number}`}>{o.order_number}</Link>
                    <div className={styles.muted}>{formatDateTime(o.created_at)}</div>
                  </td>
                  <td>{o.customer_name}</td>
                  <td className={styles.num}>{formatPriceOr(o.total_ghs as number | null, '–')}</td>
                  <td>
                    <StatusBadge status={o.status as OrderStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(recent.data ?? []).length === 0 && <p className={styles.empty}>No orders yet.</p>}
        </section>
        <section className={styles.panel} aria-labelledby="low-title">
          <h2 id="low-title">Low stock</h2>
          {low.length === 0 ? (
            <p className={styles.muted}>Nothing is running low.</p>
          ) : (
            <table className={styles.table}>
              <tbody>
                {low.slice(0, 10).map((l) => (
                  <tr key={`${l.product_id}-${l.size_code}`}>
                    <td>
                      <Link href={`/admin/inventory/${l.product_id}`}>{l.product_name}</Link>
                      {l.size_label && <span className={styles.muted}> · {l.size_label}</span>}
                    </td>
                    <td className={styles.num}>{l.available} left</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
