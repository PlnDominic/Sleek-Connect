import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatPrice, momoNetworks } from '@sleek/shared';
import { getVendorSession } from '@/lib/vendor';
import { savePayoutAccount } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Earnings' };

interface Statement {
  earned: number;
  returned: number;
  paid: number;
  pending: number;
  balance: number;
  payout_account: { network: string | null; wallet: string | null; name: string | null } | null;
  deliveries: { order_number: string; delivered_at: string; amount_ghs: number }[];
  returns: { case_number: string; order_number: string; status: string; reason: string | null; amount_ghs: number }[];
  payouts: { amount_ghs: number; method: string; reference: string; created_at: string }[];
}

const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });

export default async function VendorEarningsPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_statement');
  if (error) throw error;
  const s = data as unknown as Statement;
  const account = s.payout_account;

  return (
    <>
      <p className={styles.lead}>
        You earn your own price for each item once the order is delivered. If a shopper returns an item that you sold, that amount comes off. We pay what you are owed to your Mobile Money.
      </p>
      <div className={styles.stats}>
        <section className={styles.stat}>
          <h2>We owe you</h2>
          <strong>{formatPrice(s.balance)}</strong>
          <span>After returns and payments</span>
        </section>
        <section className={styles.stat}>
          <h2>Coming soon</h2>
          <strong>{formatPrice(s.pending)}</strong>
          <span>Paid orders not yet delivered</span>
        </section>
        <section className={styles.stat}>
          <h2>Paid to you</h2>
          <strong>{formatPrice(s.paid)}</strong>
          <span>
            Earned {formatPrice(s.earned)}
            {s.returned > 0 ? ` · returns ${formatPrice(s.returned)}` : ''}
          </span>
        </section>
      </div>

      <section className={styles.panel}>
        <h2>Where we pay you</h2>
        <VendorForm action={savePayoutAccount}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Network</span>
              <select name="network" required defaultValue={account?.network ?? 'mtn'}>
                {momoNetworks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Mobile Money number</span>
              <input name="wallet" type="tel" required defaultValue={account?.wallet ?? ''} />
            </label>
          </div>
          <label className={styles.field}>
            <span>Name on the wallet</span>
            <input name="name" required maxLength={80} defaultValue={account?.name ?? ''} />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Save payout account
            </button>
          </div>
        </VendorForm>
      </section>

      <section className={styles.panel}>
        <h2>Payments to you</h2>
        {s.payouts.length === 0 ? (
          <p className={styles.muted}>No payments yet.</p>
        ) : (
          <ul className={styles.list}>
            {s.payouts.map((p) => (
              <li key={p.reference + p.created_at} className={styles.listRow}>
                <span className={styles.listMain}>
                  {dateText(p.created_at)}
                  <small>
                    {p.method} · ref {p.reference}
                  </small>
                </span>
                <span className={styles.amount}>{formatPrice(p.amount_ghs)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2>Delivered orders</h2>
        {s.deliveries.length === 0 ? (
          <p className={styles.muted}>Your earnings appear here when orders are delivered.</p>
        ) : (
          <ul className={styles.list}>
            {s.deliveries.map((d) => (
              <li key={d.order_number} className={styles.listRow}>
                <span className={styles.listMain}>
                  {d.order_number}
                  <small>{dateText(d.delivered_at)}</small>
                </span>
                <span className={styles.amount}>{formatPrice(d.amount_ghs)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.returns.length > 0 && (
        <section className={styles.panel}>
          <h2>Returns</h2>
          <ul className={styles.list}>
            {s.returns.map((r) => (
              <li key={r.case_number} className={styles.listRow}>
                <span className={styles.listMain}>
                  {r.case_number} · order {r.order_number}
                  <small>
                    {r.status}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </small>
                </span>
                <span className={styles.amount}>{formatPrice(r.amount_ghs)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
