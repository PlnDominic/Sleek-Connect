import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice, formatPriceOr } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, type OrderStatus } from '@/lib/orders';
import { StatusBadge } from './StatusBadge';
import styles from './admin.module.css';
import dash from './dashboard.module.css';

export const metadata: Metadata = { title: 'Dashboard' };

const DAY = 86_400_000;
/** A UTC calendar day ("2026-10-26"); Accra keeps GMT all year, so this is the local day. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default async function Dashboard({ searchParams }: PageProps<'/admin'>) {
  const params = await searchParams;
  const range = params.range === '30' ? 30 : 7;
  const staff = await requireStaffPage();
  if (!staff) return null;
  const db = staff.supabase;
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const orders = () => db.from('orders').select('id', { count: 'exact', head: true });

  const now = new Date();
  const today = new Date(`${dayKey(now)}T00:00:00Z`);
  const since30 = new Date(today.getTime() - 29 * DAY);

  const [toConfirm, toPack, ready, out, failed, review, refunds, returnsToReview, returnRefunds, openCases, stock, expiring, recent, paid] = await Promise.all([
    count(orders().eq('status', 'pending_payment').eq('payment_method', 'cod')),
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
    db.from('orders').select('order_number, status, customer_name, total_ghs, created_at').order('created_at', { ascending: false }).limit(6),
    // Paid orders in the last 30 days, for the sales figures (cancelled and returned ones don't count).
    db
      .from('orders')
      .select('total_ghs, paid_at, status')
      .gte('paid_at', since30.toISOString())
      .not('status', 'in', '(cancelled,returned)')
      .limit(5000),
  ]);
  const low = (stock.data ?? []).filter((l) => l.is_low);
  const expiringCount = (expiring.data ?? []).length;
  const vendorRows = can(staff.role, 'vendors.manage')
    ? (((await db.rpc('admin_vendors')).data as unknown as { status: string; pending_products: number }[] | null) ?? [])
    : null;
  const vendorsWaiting = vendorRows?.filter((v) => v.status === 'pending').length ?? 0;
  const vendorProductsWaiting = vendorRows?.reduce((n, v) => n + Number(v.pending_products), 0) ?? 0;
  const canVendors = vendorRows !== null;
  const [shipmentsRes, threadsRes, balancesRes] = canVendors
    ? await Promise.all([db.rpc('admin_vendor_shipments'), db.rpc('admin_vendor_threads'), db.rpc('admin_vendor_balances')])
    : [null, null, null];
  const pickupsWaiting = ((shipmentsRes?.data ?? []) as unknown as { status: string }[]).filter((x) => x.status === 'packed').length;
  const vendorMessages = ((threadsRes?.data ?? []) as unknown as { unread: number }[]).reduce((n, t) => n + Number(t.unread), 0);
  const vendorsOwedTo = ((balancesRes?.data ?? []) as unknown as { balance: number }[]).filter((b) => Number(b.balance) > 0).length;
  const reviewsPending = can(staff.role, 'reviews.moderate') ? ((await db.rpc('admin_review_counts').maybeSingle()).data?.pending ?? 0) : null;

  // Sales per day.
  const sales = paid.data ?? [];
  const byDay = new Map<string, { total: number; orders: number }>();
  for (const o of sales) {
    if (!o.paid_at) continue;
    const key = o.paid_at.slice(0, 10);
    const d = byDay.get(key) ?? { total: 0, orders: 0 };
    d.total += Number(o.total_ghs ?? 0);
    d.orders += 1;
    byDay.set(key, d);
  }
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const date = new Date(today.getTime() - (n - 1 - i) * DAY);
      return { date, ...(byDay.get(dayKey(date)) ?? { total: 0, orders: 0 }) };
    });
  const sum = (list: { total: number }[]) => list.reduce((n, d) => n + d.total, 0);
  const last7 = days(7);
  const last30 = days(30);
  const todaySales = last7[6];
  const chart = range === 30 ? last30 : last7;
  const chartMax = Math.max(1, ...chart.map((d) => d.total));
  const weekMax = Math.max(1, ...last7.map((d) => d.total));
  const delivered30 = sales.filter((o) => o.status === 'delivered').length;
  const deliveredShare = sales.length ? Math.round((delivered30 / sales.length) * 100) : 0;
  const toFulfil = toPack + ready + out;

  const attention = [
    { label: 'Delivery failed', value: failed, href: '/admin/orders?view=failed' },
    { label: 'Orders to review', value: review, href: '/admin/orders?view=review' },
    { label: 'Refunds due', value: refunds + returnRefunds, href: '/admin/finance' },
    { label: 'Returns to review', value: returnsToReview, href: '/admin/returns' },
    { label: 'Open support cases', value: openCases, href: '/admin/support' },
    ...(reviewsPending === null ? [] : [{ label: 'Reviews to check', value: reviewsPending, href: '/admin/reviews' }]),
    ...(vendorRows === null
      ? []
      : [
          { label: 'Vendors to approve', value: vendorsWaiting, href: '/admin/vendors' },
          { label: 'Vendor products to review', value: vendorProductsWaiting, href: '/admin/vendors?tab=products' },
          { label: 'Vendor pickups', value: pickupsWaiting, href: '/admin/vendors?tab=pickups' },
          { label: 'Vendors to pay', value: vendorsOwedTo, href: '/admin/vendors?tab=payouts' },
          { label: 'Vendor messages', value: vendorMessages, href: '/admin/vendors?tab=messages' },
        ]),
    { label: 'Low stock', value: low.length, href: '/admin/inventory?show=low' },
    { label: 'Expiry alerts', value: expiringCount, href: '/admin/inventory' },
  ];
  const waiting = attention.filter((a) => a.value > 0);
  const waitingTotal = waiting.reduce((n, a) => n + a.value, 0);

  return (
    <>
      <div className={dash.head}>
        <h1>Dashboard</h1>
        <p>Sales, orders and what needs doing today.</p>
      </div>

      <div className={dash.stats}>
        <section className={dash.stat} aria-labelledby="stat-today">
          <h2 id="stat-today" className={dash.statLabel}>
            Sales today
          </h2>
          <strong className={dash.statValue}>{formatPrice(todaySales.total)}</strong>
          <p className={dash.statNote}>Orders to fulfil</p>
          <div className={dash.segments}>
            {toConfirm > 0 && (
              <Link href="/admin/orders?view=confirm" data-on>
                To confirm <b>{toConfirm}</b>
              </Link>
            )}
            <Link href="/admin/orders?view=to_pack" data-on={toPack > 0 || undefined}>
              To pack <b>{toPack}</b>
            </Link>
            <Link href="/admin/orders?view=ready" data-on={ready > 0 || undefined}>
              Ready <b>{ready}</b>
            </Link>
            <Link href="/admin/orders?view=out" data-on={out > 0 || undefined}>
              Out <b>{out}</b>
            </Link>
          </div>
        </section>

        <section className={dash.stat} aria-labelledby="stat-week">
          <div className={dash.statTop}>
            <div>
              <h2 id="stat-week" className={dash.statLabel}>
                Last 7 days
              </h2>
              <strong className={dash.statValue}>{formatPrice(sum(last7))}</strong>
            </div>
            <svg className={dash.spark} viewBox="0 0 70 52" aria-hidden="true">
              {last7.map((d, i) => {
                const h = Math.max(3, (d.total / weekMax) * 50);
                return <rect key={i} x={i * 10} y={52 - h} width="7" height={h} rx="2" />;
              })}
            </svg>
          </div>
          <p className={dash.statNote}>
            {last7.reduce((n, d) => n + d.orders, 0)} paid orders · {toFulfil} still to deliver
          </p>
          <Link href="/admin/finance" className={dash.more}>
            See more details →
          </Link>
        </section>

        <section className={dash.stat} aria-labelledby="stat-month">
          <div className={dash.statTop}>
            <div>
              <h2 id="stat-month" className={dash.statLabel}>
                Revenue (30 days)
              </h2>
              <strong className={dash.statValue}>{formatPrice(sum(last30))}</strong>
            </div>
            <span className={dash.ring} style={{ '--share': `${deliveredShare}%` } as React.CSSProperties} aria-hidden="true">
              <span>{deliveredShare}%</span>
            </span>
          </div>
          <p className={dash.statNote}>
            {sales.length} paid orders · <b>{deliveredShare}% delivered</b>
          </p>
          <Link href="/admin/finance" className={dash.more}>
            See more details →
          </Link>
        </section>
      </div>

      <div className={dash.row}>
        <section className={`${dash.card} ${dash.analytics}`} aria-labelledby="analytics-title">
          <div className={dash.cardHead}>
            <div>
              <h2 id="analytics-title">Analytics</h2>
              <p className={dash.analyticsValue}>
                {formatPrice(sum(chart))} <span>{range === 30 ? 'Last 30 days' : 'Last 7 days'}</span>
              </p>
            </div>
            <nav className={dash.range} aria-label="Chart period">
              <Link href="/admin" aria-current={range === 7 ? 'page' : undefined}>
                7 days
              </Link>
              <Link href="/admin?range=30" aria-current={range === 30 ? 'page' : undefined}>
                30 days
              </Link>
            </nav>
          </div>
          <div className={dash.chart} role="img" aria-label={`Sales per day, ${range === 30 ? 'last 30 days' : 'last 7 days'}`}>
            {chart.map((d) => (
              <div key={dayKey(d.date)} className={dash.barCol} title={`${shortDate.format(d.date)}: ${formatPrice(d.total)} (${d.orders} orders)`}>
                <span className={dash.bar} style={{ height: `${Math.max(2, (d.total / chartMax) * 100)}%` }} data-today={dayKey(d.date) === dayKey(today) || undefined} />
                <span className={dash.barLabel}>{range === 30 ? (d.date.getUTCDate() % 5 === 0 ? d.date.getUTCDate() : '') : weekday.format(d.date)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${dash.card} ${dash.attention}`} aria-labelledby="attention-title">
          <h2 id="attention-title">Needs attention</h2>
          <div className={dash.attentionTotal}>
            <strong>{waitingTotal}</strong>
            <span>{waitingTotal === 0 ? 'All clear' : waitingTotal === 1 ? 'item waiting' : 'items waiting'}</span>
          </div>
          <ul className={dash.legend}>
            {(waiting.length ? waiting : attention.slice(0, 4)).map((a) => (
              <li key={a.label}>
                <Link href={a.href}>
                  <span className={dash.dot} data-on={a.value > 0 || undefined} aria-hidden="true" />
                  <span className={dash.legendLabel}>{a.label}</span>
                  <b>{a.value}</b>
                  {a.value > 0 && <span className="visually-hidden"> (needs action)</span>}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/admin/orders" className={dash.more}>
            See all orders →
          </Link>
        </section>
      </div>

      <div className={dash.row}>
        <section className={`${dash.card} ${dash.wide}`} aria-labelledby="recent-title">
          <div className={dash.cardHead}>
            <h2 id="recent-title">Latest orders</h2>
            <Link href="/admin/orders" className={dash.viewAll}>
              View all
            </Link>
          </div>
          <table className={styles.table}>
            <tbody>
              {(recent.data ?? []).map((o) => (
                <tr key={o.order_number}>
                  <td>
                    <Link href={`/admin/orders/${o.order_number}`}>{o.order_number}</Link>
                    <div className={styles.muted}>{formatDateTime(o.created_at)}</div>
                  </td>
                  <td>
                    <strong>{o.customer_name}</strong>
                  </td>
                  <td className={styles.num}>
                    <strong>{formatPriceOr(o.total_ghs as number | null, '–')}</strong>
                  </td>
                  <td>
                    <StatusBadge status={o.status as OrderStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(recent.data ?? []).length === 0 && <p className={styles.empty}>No orders yet.</p>}
        </section>

        <section className={dash.card} aria-labelledby="low-title">
          <div className={dash.cardHead}>
            <h2 id="low-title">Low stock</h2>
            <Link href="/admin/inventory?show=low" className={dash.viewAll}>
              View all
            </Link>
          </div>
          {low.length === 0 ? (
            <p className={styles.muted}>Nothing is running low.</p>
          ) : (
            <ul className={dash.stockList}>
              {low.slice(0, 8).map((l) => (
                <li key={`${l.product_id}-${l.size_code}`}>
                  <Link href={`/admin/inventory/${l.product_id}`}>
                    {l.product_name}
                    {l.size_label && <span className={styles.muted}> · {l.size_label}</span>}
                  </Link>
                  <b>{l.available} left</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
