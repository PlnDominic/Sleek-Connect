import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPriceOr } from '@sleek/shared';
import { requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Finance' };

function dateParam(value: string | string[] | undefined, fallback: string) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function startOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

function endOfDay(value: string) {
  return `${value}T23:59:59.999Z`;
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export default async function FinancePage({ searchParams }: PageProps<'/admin/finance'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = dateParam(params.from, today);
  const to = dateParam(params.to, today);
  const after = startOfDay(from <= to ? from : to);
  const before = endOfDay(from <= to ? to : from);
  const db = staff.supabase;

  const [paymentsResult, ordersResult, returnsResult] = await Promise.all([
    db
      .from('payments')
      .select('id, provider, provider_reference, amount_ghs, status, created_at, updated_at, orders(order_number, customer_name)')
      .gte('created_at', after)
      .lte('created_at', before)
      .order('created_at', { ascending: false })
      .limit(1000),
    db
      .from('orders')
      .select('order_number, status, total_ghs, paid_at, refund_due, created_at, customer_name')
      .gte('created_at', after)
      .lte('created_at', before)
      .order('created_at', { ascending: false })
      .limit(1000),
    db
      .from('return_requests')
      .select('case_number, status, refund_amount_ghs, refunded_at, created_at, orders(order_number, customer_name)')
      .gte('created_at', after)
      .lte('created_at', before)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);
  if (paymentsResult.error) throw paymentsResult.error;
  if (ordersResult.error) throw ordersResult.error;
  if (returnsResult.error) throw returnsResult.error;

  const payments = paymentsResult.data ?? [];
  const orders = ordersResult.data ?? [];
  const returns = returnsResult.data ?? [];
  const succeeded = payments.filter((payment) => payment.status === 'succeeded');
  const failed = payments.filter((payment) => payment.status === 'failed');
  const pending = payments.filter((payment) => payment.status === 'pending');
  const refundOrders = orders.filter((order) => order.refund_due);
  const refundReturns = returns.filter((item) => item.status === 'received');
  const refundedReturns = returns.filter((item) => item.status === 'refunded');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Finance</h1>
          <p className={styles.muted}>Payment activity, reconciliation and refunds for the selected period.</p>
        </div>
        <a className={styles.secondary} href={`/admin/finance/export?from=${from}&to=${to}`} download>
          Export CSV
        </a>
      </div>

      <section className={styles.panel} aria-labelledby="period-title">
        <h2 id="period-title">Reporting period</h2>
        <form className={styles.row} method="get">
          <label className={styles.field}>
            <span>From</span>
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label className={styles.field}>
            <span>To</span>
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button className={styles.primary} type="submit">Apply</button>
        </form>
      </section>

      <section className={styles.cards} aria-label="Finance summary">
        <Summary label="Successful payments" value={formatPriceOr(sum(succeeded.map((p) => p.amount_ghs)), '–')} detail={`${succeeded.length} attempts`} />
        <Summary label="Failed payments" value={String(failed.length)} detail={`${pending.length} still pending`} tone={failed.length > 0 ? 'warn' : undefined} />
        <Summary label="Orders needing refund" value={String(refundOrders.length)} detail={formatPriceOr(sum(refundOrders.map((o) => o.total_ghs)), '–')} tone={refundOrders.length > 0 ? 'warn' : undefined} />
        <Summary label="Return refunds due" value={String(refundReturns.length)} detail={formatPriceOr(sum(refundReturns.map((r) => r.refund_amount_ghs)), '–')} tone={refundReturns.length > 0 ? 'warn' : undefined} />
      </section>

      <section className={styles.panel} aria-labelledby="payments-title">
        <div className={styles.panelHead}>
          <div>
            <h2 id="payments-title">Payment attempts</h2>
            <p className={styles.muted}>Compare provider references and amounts with the provider settlement report.</p>
          </div>
          <span className={styles.muted}>{payments.length} attempts</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Created</th><th>Order</th><th>Provider</th><th>Reference</th><th className={styles.num}>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDateTime(payment.created_at)}</td>
                  <td>{payment.orders ? <Link href={`/admin/orders/${payment.orders.order_number}`}>{payment.orders.order_number}</Link> : '–'}</td>
                  <td>{payment.provider}</td>
                  <td><code>{payment.provider_reference}</code></td>
                  <td className={styles.num}>{formatPriceOr(payment.amount_ghs, '–')}</td>
                  <td><span className={styles.badge} data-tone={payment.status === 'succeeded' ? 'good' : payment.status === 'failed' ? 'bad' : 'warn'}>{payment.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && <p className={styles.empty}>No payment attempts in this period.</p>}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="refunds-title">
        <div className={styles.panelHead}>
          <div>
            <h2 id="refunds-title">Return refunds</h2>
            <p className={styles.muted}>Received returns still need payment outside the system; use the return record to capture the reference.</p>
          </div>
          <span className={styles.muted}>{refundedReturns.length} completed</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Return</th><th>Order</th><th>Customer</th><th className={styles.num}>Amount</th><th>Status</th><th>Refunded</th></tr></thead>
            <tbody>
              {returns.map((item) => (
                <tr key={item.case_number}>
                  <td><Link href={`/admin/returns/${item.case_number}`}>{item.case_number}</Link></td>
                  <td>{item.orders?.order_number ?? '–'}</td>
                  <td>{item.orders?.customer_name ?? '–'}</td>
                  <td className={styles.num}>{formatPriceOr(item.refund_amount_ghs, '–')}</td>
                  <td><span className={styles.badge} data-tone={item.status === 'refunded' ? 'good' : item.status === 'received' ? 'warn' : undefined}>{item.status}</span></td>
                  <td>{item.refunded_at ? formatDateTime(item.refunded_at) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {returns.length === 0 && <p className={styles.empty}>No return records in this period.</p>}
        </div>
      </section>
    </>
  );
}

function Summary({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'warn' }) {
  return (
    <div className={styles.card} data-tone={tone}>
      <span className={styles.muted}>{label}</span>
      <strong>{value}</strong>
      <small className={styles.muted}>{detail}</small>
    </div>
  );
}
