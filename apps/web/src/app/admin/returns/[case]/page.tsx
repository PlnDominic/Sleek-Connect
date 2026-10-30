import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, returnReasons, type ReturnReason, type ReturnStatus } from '@/lib/orders';
import { ActionForm } from '../../ActionForm';
import { Flash } from '../../Flash';
import { decideReturn, markRefunded, receiveReturn } from '../actions';
import { outcomeLabels, returnStatusShort, returnTones } from '../labels';
import styles from '../../admin.module.css';

export async function generateMetadata({ params }: PageProps<'/admin/returns/[case]'>): Promise<Metadata> {
  return { title: `Return ${(await params).case}` };
}

export default async function ReturnPage({ params, searchParams }: PageProps<'/admin/returns/[case]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const [{ case: caseNumber }, { done }] = await Promise.all([params, searchParams]);
  const db = staff.supabase;

  const { data: r, error } = await db
    .from('return_requests')
    .select(
      'id, case_number, status, reason, details, photo_paths, decision_note, decided_at, decided_by, received_at, received_by, refund_amount_ghs, refunded_at, refund_reference, created_at, orders(order_number, customer_name, phone, payment_method, momo_network, delivered_at), return_items(order_item_id, quantity, outcome, order_items(product_name, size_label, unit_price_ghs))',
    )
    .eq('case_number', caseNumber)
    .maybeSingle();
  if (error) throw error;
  if (!r) notFound();

  // Photos are private: staff see them through links that expire after 10 minutes.
  const { data: signed } = r.photo_paths.length
    ? await db.storage.from('return-photos').createSignedUrls(r.photo_paths, 600)
    : { data: [] };
  const photos = (signed ?? []).flatMap((p) => (p.signedUrl ? [p.signedUrl] : []));

  const status = r.status as ReturnStatus;
  const id = r.id;
  const items = r.return_items;
  const value = items.reduce((sum, i) => sum + (i.order_items?.unit_price_ghs ?? 0) * i.quantity, 0);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href="/admin/returns">Returns</Link>
          </p>
          <h1>
            Return {r.case_number}{' '}
            <span className={styles.badge} data-tone={returnTones[status]}>
              {returnStatusShort[status]}
            </span>
          </h1>
          <p className={styles.muted}>Requested {formatDateTime(r.created_at)}</p>
        </div>
      </div>
      <Flash message={done} />

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>Request</h2>
          <dl className={styles.facts}>
            <dt>Order</dt>
            <dd>
              {r.orders && <Link href={`/admin/orders/${r.orders.order_number}`}>{r.orders.order_number}</Link>}
              {r.orders?.delivered_at && ` · delivered ${formatDateTime(r.orders.delivered_at)}`}
            </dd>
            <dt>Customer</dt>
            <dd>
              {r.orders?.customer_name} · {r.orders?.phone}
            </dd>
            <dt>Reason</dt>
            <dd>{returnReasons[r.reason as ReturnReason]}</dd>
            {r.details && (
              <>
                <dt>Details</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{r.details}</dd>
              </>
            )}
            <dt>Paid with</dt>
            <dd>{r.orders?.payment_method === 'momo' ? `Mobile Money${r.orders.momo_network ? ` (${r.orders.momo_network.toUpperCase()})` : ''}` : 'Card'}</dd>
          </dl>
          <h3>Items</h3>
          <ul>
            {items.map((i) => (
              <li key={i.order_item_id}>
                {i.quantity} × {i.order_items?.product_name}
                {i.order_items?.size_label ? ` (${i.order_items.size_label})` : ''} ·{' '}
                {formatPrice((i.order_items?.unit_price_ghs ?? 0) * i.quantity)}
                {i.outcome && <span className={styles.badge}>{outcomeLabels[i.outcome as keyof typeof outcomeLabels]}</span>}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>Value of returned items: {formatPrice(value)} (delivery isn’t refunded).</p>
        </section>

        <section className={styles.panel}>
          <h2>Photos</h2>
          {photos.length === 0 ? (
            <p className={styles.muted}>No photos attached.</p>
          ) : (
            <div className={styles.row}>
              {photos.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links to private photos */}
                  <img src={url} alt={`Customer photo ${i + 1}`} width={160} height={160} style={{ objectFit: 'cover', borderRadius: 8 }} />
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <h2>History</h2>
        <dl className={styles.facts}>
          <dt>Requested</dt>
          <dd>{formatDateTime(r.created_at)}</dd>
          {r.decided_at && (
            <>
              <dt>{status === 'rejected' ? 'Declined' : 'Approved'}</dt>
              <dd>
                {formatDateTime(r.decided_at)} by {r.decided_by ?? 'staff'}
                {r.decision_note && <> · “{r.decision_note}”</>}
              </dd>
            </>
          )}
          {r.received_at && (
            <>
              <dt>Received</dt>
              <dd>
                {formatDateTime(r.received_at)} by {r.received_by ?? 'staff'}
                {r.refund_amount_ghs !== null && ` · refund due ${formatPrice(r.refund_amount_ghs)}`}
              </dd>
            </>
          )}
          {r.refunded_at && (
            <>
              <dt>Refunded</dt>
              <dd>
                {formatDateTime(r.refunded_at)} · reference {r.refund_reference}
              </dd>
            </>
          )}
        </dl>
      </section>

      {status === 'requested' && can(staff.role, 'returns.decide') && (
        <section className={styles.panel}>
          <h2>Decide</h2>
          <ActionForm action={decideReturn.bind(null, id, r.case_number)}>
            <label className={styles.field}>
              <span>Note to the customer</span>
              <textarea name="note" rows={3} maxLength={500} placeholder="Required when declining. For approvals, say how the item will be collected." />
            </label>
            <div className={styles.buttons}>
              <button type="submit" name="decision" value="approve" className={styles.primary}>
                Approve return
              </button>
              <button type="submit" name="decision" value="reject" className={styles.danger}>
                Decline
              </button>
            </div>
          </ActionForm>
        </section>
      )}

      {status === 'approved' && can(staff.role, 'returns.receive') && (
        <section className={styles.panel}>
          <h2>Receive and inspect</h2>
          <p className={styles.muted}>Once the item is back, choose what happens to each one. Restocked units go back on sale.</p>
          <ActionForm action={receiveReturn.bind(null, id, r.case_number)}>
            {items.map((i) => (
              <label key={i.order_item_id} className={styles.field}>
                <span>
                  {i.quantity} × {i.order_items?.product_name}
                  {i.order_items?.size_label ? ` (${i.order_items.size_label})` : ''}
                </span>
                <select name={`outcome:${i.order_item_id}`} required defaultValue="">
                  <option value="" disabled>
                    Choose
                  </option>
                  {Object.entries(outcomeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className={styles.field}>
              <span>Inspection note (optional)</span>
              <input name="note" maxLength={300} />
            </label>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Mark as received
              </button>
            </div>
          </ActionForm>
        </section>
      )}

      {status === 'received' && can(staff.role, 'returns.refund') && (
        <section className={styles.panel}>
          <h2>Refund</h2>
          <p className={styles.muted}>
            Send {r.refund_amount_ghs === null ? 'the refund' : formatPrice(r.refund_amount_ghs)} to the customer’s{' '}
            {r.orders?.payment_method === 'momo' ? 'Mobile Money wallet' : 'card'}, then record the transaction ID here.
          </p>
          <ActionForm action={markRefunded.bind(null, id, r.case_number)}>
            <label className={styles.field}>
              <span>Refund reference</span>
              <input name="reference" required maxLength={120} placeholder="e.g. MoMo transaction ID" />
            </label>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Mark as refunded
              </button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
