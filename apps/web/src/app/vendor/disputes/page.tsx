import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { getVendorSession } from '@/lib/vendor';
import { respondToDispute } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Disputes' };

interface Dispute {
  id: string;
  case_number: string;
  order_number: string;
  product_name: string;
  kind: string;
  status: 'open' | 'vendor_replied' | 'resolved';
  details: string;
  opened_at: string;
  due_at: string;
  response: string | null;
  outcome: 'upheld' | 'partly_upheld' | 'dismissed' | null;
  resolution_note: string | null;
  charge_ghs: number;
}

const kinds: Record<string, string> = { counterfeit: 'Counterfeit', damaged: 'Damaged', not_as_described: 'Not as described', wrong_item: 'Wrong item', other: 'Other' };
const outcomes = { upheld: 'Decided against you', partly_upheld: 'Partly decided against you', dismissed: 'Dismissed: in your favour' } as const;
const dateText = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });

export default async function VendorDisputesPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_disputes_list');
  if (error) throw error;
  const disputes = data as unknown as Dispute[];

  return (
    <>
      <p className={styles.lead}>
        When a shopper reports a problem with one of your products (a fake, a damaged or wrong item), we open a case here. You have <strong>48 hours</strong> to reply with
        what you know. We then decide; if it goes against you, up to your share of that item comes off your earnings. A second upheld counterfeit case closes a store.
        See the <Link href="/sell/terms#returns">seller terms</Link>.
      </p>
      {disputes.length === 0 && (
        <section className={styles.panel}>
          <p className={styles.muted}>No cases. They appear here if a shopper reports a problem.</p>
        </section>
      )}
      {disputes.map((d) => (
        <section key={d.id} className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>
              {d.case_number} · {d.product_name}
            </h2>
            <span className={styles.badge} data-tone={d.status === 'resolved' ? (d.outcome === 'dismissed' ? 'good' : 'bad') : d.status === 'open' ? 'warn' : 'off'}>
              {d.status === 'resolved' ? outcomes[d.outcome ?? 'dismissed'] : d.status === 'open' ? 'Needs your reply' : 'Waiting for our decision'}
            </span>
          </div>
          <p className={styles.muted}>
            {kinds[d.kind] ?? d.kind} · order {d.order_number} · opened {dateText(d.opened_at)}
            {d.status === 'open' ? ` · reply by ${dateText(d.due_at)}` : ''}
          </p>
          <p>{d.details}</p>
          {d.response && (
            <p>
              <strong>Your reply:</strong> {d.response}
            </p>
          )}
          {d.status === 'resolved' && (
            <p className={styles.muted}>
              {d.charge_ghs > 0 ? `${formatPrice(d.charge_ghs)} was taken off your earnings. ` : ''}
              {d.resolution_note}
            </p>
          )}
          {d.status !== 'resolved' && (
            <VendorForm action={respondToDispute.bind(null, d.id)}>
              <label className={styles.field}>
                <span>{d.response ? 'Add to your reply' : 'Your reply'}</span>
                <textarea name="response" rows={3} required minLength={5} maxLength={2000} placeholder="What you know: the batch, when you packed it, your invoice or supplier." />
              </label>
              <div className={styles.buttons}>
                <button type="submit" className={styles.primary}>
                  Send reply
                </button>
              </div>
            </VendorForm>
          )}
        </section>
      ))}
    </>
  );
}
