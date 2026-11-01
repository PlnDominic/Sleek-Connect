import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatPrice, momoNetworks } from '@sleek/shared';
import { getVendorSession } from '@/lib/vendor';
import { savePayoutAccount, saveTaxInfo } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Earnings' };

interface Statement {
  earned: number;
  returned: number;
  paid: number;
  pending: number;
  charged?: number;
  balance: number;
  payable?: number;
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
  // The payout rules and the vendor's tax details (a database without them yet shows the older page).
  const { data: launchData } = await session.supabase.rpc('vendor_launch_state');
  const launch = launchData as unknown as {
    business_type: 'individual' | 'company' | null;
    legal_name: string | null;
    business_registration: string | null;
    tin: string | null;
    payout_hold_days: number;
    min_payout_ghs: number;
    tin_required: boolean;
  } | null;

  return (
    <>
      <p className={styles.lead}>
        You earn your own price for each item once the order is delivered. If a shopper returns an item that you sold, or a dispute is decided against you, that amount comes off.
        We pay what is payable to your Mobile Money{launch ? `, normally on Fridays. Earnings can be paid ${launch.payout_hold_days} days after delivery, so a return can still be asked for first, and the smallest payout is ${formatPrice(launch.min_payout_ghs)}` : ''}.
      </p>
      {launch?.tin_required && !launch.tin && (
        <p className={styles.notice}>Add your tax details below. We can’t pay you until we have your tax identification number.</p>
      )}
      <div className={styles.stats}>
        <section className={styles.stat}>
          <h2>We owe you</h2>
          <strong>{formatPrice(s.balance)}</strong>
          <span>
            {s.payable !== undefined ? `${formatPrice(s.payable)} can be paid now` : 'After returns and payments'}
            {s.charged ? ` · disputes ${formatPrice(s.charged)}` : ''}
          </span>
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

      {launch && (
        <section className={styles.panel}>
          <h2>Tax details</h2>
          <p className={styles.muted}>
            We need these before we can pay you, and to report what we pay you to the tax authority. For an individual the TIN is your Ghana Card number.
          </p>
          <VendorForm action={saveTaxInfo}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>You sell as</span>
                <select name="business_type" defaultValue={launch.business_type ?? 'individual'}>
                  <option value="individual">An individual</option>
                  <option value="company">A registered business</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Legal name</span>
                <input name="legal_name" required maxLength={120} defaultValue={launch.legal_name ?? ''} />
                <small>Your name as on your ID, or the registered business name.</small>
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Tax identification number (TIN)</span>
                <input name="tin" required maxLength={20} defaultValue={launch.tin ?? ''} />
              </label>
              <label className={styles.field}>
                <span>Business registration number (if any)</span>
                <input name="business_registration" maxLength={40} defaultValue={launch.business_registration ?? ''} />
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Save tax details
              </button>
            </div>
          </VendorForm>
        </section>
      )}

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
