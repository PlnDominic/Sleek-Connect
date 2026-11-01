import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { ActionForm } from '../ActionForm';
import { openDispute, resolveDispute } from './actions';
import type { Staff } from './page';
import styles from '../admin.module.css';

interface Dispute {
  id: string;
  case_number: string;
  vendor_name: string;
  order_number: string;
  product_name: string;
  kind: string;
  status: 'open' | 'vendor_replied' | 'resolved';
  details: string;
  opened_at: string;
  due_at: string;
  overdue: boolean;
  response: string | null;
  responded_at: string | null;
  outcome: 'upheld' | 'partly_upheld' | 'dismissed' | null;
  resolution_note: string | null;
  charge_ghs: number;
  resolved_at: string | null;
  counterfeit_strikes: number;
}

const kindLabels: Record<string, string> = {
  counterfeit: 'Counterfeit',
  damaged: 'Damaged',
  not_as_described: 'Not as described',
  wrong_item: 'Wrong item',
  other: 'Other',
};
const outcomeLabels = { upheld: 'Upheld', partly_upheld: 'Partly upheld', dismissed: 'Dismissed' } as const;
const dateText = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });

/** Shopper reports about items from independent stores: open a case, let the vendor reply, decide it. */
export async function DisputesTab({ staff, order }: { staff: Staff; order: string | null }) {
  const { data, error } = await staff.supabase.rpc('admin_vendor_disputes');
  if (error) throw error;
  const disputes = data as unknown as Dispute[];

  // Step one of opening a case: find the order, and list its items that come from independent stores.
  let items: { product_id: string; product_name: string; vendor: string }[] = [];
  let orderNumber = '';
  let notFound = false;
  if (order) {
    orderNumber = order.trim().toUpperCase();
    const { data: row } = await staff.supabase.from('orders').select('id, order_number').eq('order_number', orderNumber).maybeSingle();
    if (!row) {
      notFound = true;
    } else {
      const { data: lines } = await staff.supabase.from('order_items').select('product_id, product_name, vendor_id').eq('order_id', row.id);
      const vendorIds = [...new Set((lines ?? []).map((l) => l.vendor_id).filter((id): id is string => Boolean(id)))];
      const { data: vendors } = vendorIds.length ? await staff.supabase.from('vendors').select('id, name, is_house').in('id', vendorIds) : { data: [] };
      const byId = new Map((vendors ?? []).map((v) => [v.id, v]));
      items = (lines ?? [])
        .filter((l) => l.product_id && l.vendor_id && byId.get(l.vendor_id) && !byId.get(l.vendor_id)!.is_house)
        .map((l) => ({ product_id: l.product_id!, product_name: l.product_name, vendor: byId.get(l.vendor_id!)!.name }));
    }
  }

  const open = disputes.filter((d) => d.status !== 'resolved');
  return (
    <>
      <p className={styles.muted}>
        When a shopper reports a counterfeit, damaged or wrong item from an independent store, open a case here. The vendor has 48 hours to reply; you then decide it
        and can charge the vendor up to their share of that item. A second upheld counterfeit case means suspending the store (see the{' '}
        <Link href="/sell/terms#returns">seller terms</Link>).
      </p>

      <section className={styles.panel}>
        <h2>Open a case</h2>
        <form method="get" action="/admin/vendors" className={styles.search} role="search">
          <input type="hidden" name="tab" value="disputes" />
          <input name="order" defaultValue={orderNumber} placeholder="Order number, e.g. SC-1006" aria-label="Order number" required />
          <button type="submit" className={styles.secondary}>
            Find the order
          </button>
        </form>
        {notFound && <p className={styles.error}>No order {orderNumber}.</p>}
        {order && !notFound && items.length === 0 && <p className={styles.muted}>Order {orderNumber} has no items from independent stores.</p>}
        {items.length > 0 && (
          <ActionForm action={openDispute} resetOnSuccess>
            <input type="hidden" name="order" value={orderNumber} />
            <label className={styles.field}>
              <span>Which item?</span>
              <select name="product" required defaultValue={items[0].product_id}>
                {items.map((i) => (
                  <option key={i.product_id} value={i.product_id}>
                    {i.product_name} (sold by {i.vendor})
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>What was reported?</span>
              <select name="kind" defaultValue="damaged">
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Details for the vendor (no shopper name, phone or address)</span>
              <textarea name="details" rows={3} required minLength={5} maxLength={1500} />
            </label>
            <button type="submit" className={styles.primary}>
              Open the case
            </button>
          </ActionForm>
        )}
      </section>

      {disputes.length === 0 && <p className={styles.empty}>No cases yet.</p>}
      {open.length > 0 && <h2>Open cases ({open.length})</h2>}
      {disputes.map((d) => (
        <section key={d.id} className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>
              {d.case_number} · {d.product_name}
            </h2>
            <span className={styles.badge} data-tone={d.status === 'resolved' ? 'good' : d.overdue ? 'bad' : 'warn'}>
              {d.status === 'resolved' ? outcomeLabels[d.outcome ?? 'dismissed'] : d.status === 'vendor_replied' ? 'Vendor replied' : d.overdue ? 'Reply overdue' : 'Waiting for the vendor'}
            </span>
          </div>
          <p className={styles.muted}>
            {kindLabels[d.kind] ?? d.kind} · order {d.order_number} · sold by {d.vendor_name} · opened {dateText(d.opened_at)}
            {d.status === 'open' ? ` · reply due ${dateText(d.due_at)}` : ''}
            {d.counterfeit_strikes > 0 ? ` · ${d.counterfeit_strikes} upheld counterfeit case${d.counterfeit_strikes === 1 ? '' : 's'} so far` : ''}
          </p>
          <p>{d.details}</p>
          {d.response && (
            <p>
              <strong>Vendor’s reply</strong> ({d.responded_at ? dateText(d.responded_at) : ''}): {d.response}
            </p>
          )}
          {d.status === 'resolved' ? (
            <p className={styles.muted}>
              {outcomeLabels[d.outcome ?? 'dismissed']}
              {d.charge_ghs > 0 ? `, ${formatPrice(d.charge_ghs)} charged to the vendor` : ''}: {d.resolution_note}
            </p>
          ) : (
            <ActionForm action={resolveDispute.bind(null, d.id)} confirm="Decide this case? The vendor is told, and any charge comes off their earnings.">
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Decision</span>
                  <select name="outcome" defaultValue="upheld">
                    <option value="upheld">Upheld (the shopper was right)</option>
                    <option value="partly_upheld">Partly upheld</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Charge the vendor (GH₵)</span>
                  <input name="charge" type="number" min={0} step="0.01" defaultValue={0} />
                  <small>Up to their share of the item. Zero if dismissed.</small>
                </label>
              </div>
              <label className={styles.field}>
                <span>Decision and reason (the vendor sees it)</span>
                <textarea name="note" rows={2} required maxLength={1500} />
              </label>
              <button type="submit" className={styles.primary}>
                Decide
              </button>
            </ActionForm>
          )}
        </section>
      ))}
    </>
  );
}
