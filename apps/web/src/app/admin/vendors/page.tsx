import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { Flash } from '../Flash';
import {
  bulkReviewProducts,
  collectItems,
  recordPayout,
  recordSubscription,
  replyToVendor,
  reviewProduct,
  reviewVendor,
  saveMarketplaceSettings,
} from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Vendors' };

interface VendorRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  created_at: string;
  live: boolean;
  phone: string | null;
  email: string | null;
  review_note: string | null;
  owner_name: string | null;
  id_type: string | null;
  id_number: string | null;
  id_document_path: string | null;
  paid_until: string | null;
  products: number;
  pending_products: number;
}

interface ReviewRow {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  department: string;
  summary: string;
  vendor_name: string;
  vendor_slug: string;
  vendor_price_ghs: number;
  markup_percent: number;
  price_ghs: number;
  review_note: string | null;
  publish_requested: boolean;
  problems: string[];
  image_count: number;
  category_id: string | null;
  description: string | null;
  ingredients: string | null;
  /** What an approved product looked like before the vendor changed it and sent it back for review. */
  review_previous: Record<string, string | null> | null;
}

interface Shipment {
  order_id: string;
  order_number: string;
  order_status: string;
  vendor_id: string;
  vendor_name: string;
  vendor_phone: string | null;
  status: 'pending' | 'packed' | 'collected';
  packed_at: string | null;
  items: { name: string; size: string | null; quantity: number }[];
}

interface Balance {
  vendor_id: string;
  name: string;
  slug: string;
  earned: number;
  returned: number;
  paid: number;
  pending: number;
  balance: number;
  payout_network: string | null;
  payout_wallet: string | null;
  payout_name: string | null;
  last_payout_at: string | null;
}

interface Payout {
  id: string;
  vendor_name: string;
  amount_ghs: number;
  method: string;
  reference: string;
  note: string | null;
  created_at: string;
}

interface Thread {
  vendor_id: string;
  vendor_name: string;
  last_body: string;
  last_sender: 'vendor' | 'owner';
  last_at: string;
  unread: number;
}

const tabs = [
  { id: 'vendors', label: 'Vendors' },
  { id: 'products', label: 'Products to review' },
  { id: 'pickups', label: 'Pickups' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'messages', label: 'Messages' },
  { id: 'settings', label: 'Marketplace settings' },
] as const;
type Tab = (typeof tabs)[number]['id'];

const BULK_FORM = 'bulk-review';
const statusLabels = { pending: 'Waiting for approval', active: 'Approved', suspended: 'Suspended', rejected: 'Rejected' } as const;
const idLabels: Record<string, string> = { ghana_card: 'Ghana Card', passport: 'Passport', voters_id: 'Voter’s ID', drivers_license: 'Driver’s licence' };
const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function VendorsPage({ searchParams }: PageProps<'/admin/vendors'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'vendors.manage')) return <p className={styles.notice}>Only admins can manage vendors.</p>;

  const params = await searchParams;
  const tab: Tab = tabs.find((t) => t.id === params.tab)?.id ?? 'vendors';

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Vendors</h1>
          <p className={styles.muted}>Approve stores, record payments and set markups.</p>
        </div>
      </div>
      <Flash message={params.done} />
      <nav className={styles.tabs} aria-label="Vendor sections">
        {tabs.map((t) => (
          <Link key={t.id} href={`/admin/vendors?tab=${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'vendors' && <VendorsTab staff={staff} />}
      {tab === 'products' && <ReviewTab staff={staff} />}
      {tab === 'pickups' && <PickupsTab staff={staff} />}
      {tab === 'payouts' && <PayoutsTab staff={staff} />}
      {tab === 'messages' && <MessagesTab staff={staff} vendor={typeof params.vendor === 'string' ? params.vendor : null} />}
      {tab === 'settings' && <SettingsTab staff={staff} />}
    </>
  );
}

type Staff = NonNullable<Awaited<ReturnType<typeof requireStaffPage>>>;

async function VendorsTab({ staff }: { staff: Staff }) {
  const [{ data, error }, { data: settings }] = await Promise.all([
    staff.supabase.rpc('admin_vendors'),
    staff.supabase.from('store_settings').select('vendor_annual_fee_ghs').single(),
  ]);
  if (error) throw error;
  const vendors = data as unknown as VendorRow[];
  // Short-lived links to each applicant's ID file (a private bucket only admins can open).
  const idLinks = new Map<string, string>();
  await Promise.all(
    vendors
      .filter((v) => v.id_document_path)
      .map(async (v) => {
        const { data: signed } = await staff.supabase.storage.from('vendor-ids').createSignedUrl(v.id_document_path!, 300);
        if (signed?.signedUrl) idLinks.set(v.id, signed.signedUrl);
      }),
  );
  if (vendors.length === 0) {
    return <p className={styles.empty}>No vendors have applied yet. Share the /sell page to invite them.</p>;
  }
  const fee = settings?.vendor_annual_fee_ghs ?? 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {vendors.map((v) => (
        <section key={v.id} className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>{v.name}</h2>
            <span className={styles.badge} data-tone={v.live ? 'good' : v.status === 'pending' ? 'warn' : v.status === 'active' ? 'warn' : 'bad'}>
              {v.live ? 'Live' : v.status === 'active' ? 'Approved, not paid' : statusLabels[v.status]}
            </span>
          </div>
          <p className={styles.muted}>
            {v.tagline ? `${v.tagline} · ` : ''}Applied {dateText(v.created_at)} · {v.phone ?? 'no phone'} · {v.email ?? 'no email'}
            {v.status !== 'pending' && v.status !== 'rejected' ? (
              <>
                {' '}
                · <Link href={`/store/${v.slug}`}>/store/{v.slug}</Link>
              </>
            ) : null}
          </p>
          <p className={styles.muted}>
            {v.products} product{v.products === 1 ? '' : 's'}
            {v.pending_products > 0 ? ` (${v.pending_products} waiting for review)` : ''} ·{' '}
            {v.paid_until ? `Paid until ${dateText(v.paid_until)}${v.paid_until < today ? ' (ended)' : ''}` : 'No payment recorded'}
          </p>

          {v.owner_name && (
            <dl className={styles.facts}>
              <dt>Owner</dt>
              <dd>
                <strong>{v.owner_name}</strong>
              </dd>
              <dt>ID</dt>
              <dd>
                {idLabels[v.id_type ?? ''] ?? '–'} · {v.id_number ?? '–'}
                {idLinks.get(v.id) && (
                  <>
                    {' · '}
                    <a href={idLinks.get(v.id)} target="_blank" rel="noopener noreferrer">
                      View ID document
                    </a>
                  </>
                )}
              </dd>
            </dl>
          )}

          <ActionForm action={reviewVendor.bind(null, v.id)}>
            <label className={styles.field}>
              <span>Note to the vendor (optional)</span>
              <input name="note" defaultValue={v.review_note ?? ''} maxLength={1000} />
            </label>
            <div className={styles.buttons}>
              {v.status !== 'active' && (
                <button type="submit" name="decision" value="active" className={styles.primary}>
                  Approve
                </button>
              )}
              {v.status === 'pending' && (
                <button type="submit" name="decision" value="rejected" className={styles.secondary} data-confirm={`Reject ${v.name}'s application?`}>
                  Reject
                </button>
              )}
              {v.status === 'active' && (
                <button
                  type="submit"
                  name="decision"
                  value="suspended"
                  className={styles.danger}
                  data-confirm={`Suspend ${v.name}? Their store and ${v.products} product${v.products === 1 ? '' : 's'} come off the site until you approve them again.`}
                >
                  Suspend
                </button>
              )}
            </div>
          </ActionForm>

          {v.status === 'active' && (
            <ActionForm action={recordSubscription.bind(null, v.id)} resetOnSuccess>
              <h3>Record a yearly payment</h3>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Amount paid (GH₵)</span>
                  <input name="amount" type="number" min={0} step="0.01" required defaultValue={fee} />
                </label>
                <label className={styles.field}>
                  <span>Paid by</span>
                  <select name="method" defaultValue="momo">
                    <option value="momo">Mobile Money</option>
                    <option value="bank">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="manual">Cash / other</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Payment reference</span>
                  <input name="reference" maxLength={100} />
                </label>
              </div>
              <div className={styles.buttons}>
                <button type="submit" className={styles.secondary}>
                  Record payment (adds one year)
                </button>
              </div>
            </ActionForm>
          )}
        </section>
      ))}
    </>
  );
}

async function ReviewTab({ staff }: { staff: Staff }) {
  const [{ data, error }, { data: settings }] = await Promise.all([
    staff.supabase.rpc('admin_vendor_products', { p_status: 'pending' }),
    staff.supabase.from('store_settings').select('default_markup_percent').single(),
  ]);
  if (error) throw error;
  const items = data as unknown as ReviewRow[];
  if (items.length === 0) return <p className={styles.empty}>No vendor products are waiting for review.</p>;
  const defaultMarkup = settings?.default_markup_percent ?? 10;

  return (
    <>
      <section className={styles.panel} aria-label="Review several at once">
        <h2>Review several at once</h2>
        <p className={styles.muted}>Tick products below, then approve or reject them together.</p>
        <ActionForm action={bulkReviewProducts} id={BULK_FORM} className={styles.form}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Markup for all ticked products (%)</span>
              <input name="markup" type="number" min={0} max={200} step="0.5" placeholder={`Blank keeps each product's own (${defaultMarkup}% to start)`} />
            </label>
            <label className={styles.field}>
              <span>Note to the vendors (optional)</span>
              <input name="note" maxLength={500} />
            </label>
          </div>
          <div className={styles.buttons}>
            <button type="submit" name="decision" value="approved" className={styles.primary} data-confirm="Approve every ticked product?">
              Approve ticked
            </button>
            <button type="submit" name="decision" value="rejected" className={styles.secondary} data-confirm="Reject every ticked product?">
              Reject ticked
            </button>
          </div>
        </ActionForm>
      </section>
      {items.map((p) => (
        <section key={p.id} className={styles.panel}>
          <div className={styles.panelHead}>
            <label className={styles.check}>
              <input type="checkbox" name="ids" value={p.id} form={BULK_FORM} aria-label={`Select ${p.name}`} />
              <strong className={styles.itemTitle}>{p.name}</strong>
            </label>
            <span className={styles.badge} data-tone={p.problems.length ? 'bad' : 'warn'}>
              {p.problems.length ? 'Incomplete' : 'Ready to review'}
            </span>
          </div>
          <p className={styles.muted}>
            {p.brand ? `${p.brand} · ` : ''}
            {p.department} · sold by <Link href={`/store/${p.vendor_slug}`}>{p.vendor_name}</Link> · {p.image_count} photo
            {p.image_count === 1 ? '' : 's'}
            {p.publish_requested ? '' : ' · vendor has not asked to publish yet'}
          </p>
          {p.summary && <p>{p.summary}</p>}
          {p.problems.length > 0 && <p className={styles.error}>Missing: {p.problems.join(', ')}.</p>}
          {p.review_previous && <ChangedFields before={p.review_previous} after={p} />}
          <ActionForm action={reviewProduct.bind(null, p.id)}>
            <div className={styles.row}>
              <div className={styles.field}>
                <span>Vendor’s price</span>
                <strong>{formatPrice(p.vendor_price_ghs)}</strong>
              </div>
              <label className={styles.field}>
                <span>Your markup (%)</span>
                <input name="markup" type="number" min={0} max={200} step="0.5" required defaultValue={p.markup_percent || defaultMarkup} />
                <small>The shopper pays the vendor’s price plus this markup.</small>
              </label>
              <label className={styles.field}>
                <span>Note to the vendor (optional)</span>
                <input name="note" maxLength={500} defaultValue={p.review_note ?? ''} />
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" name="decision" value="approved" className={styles.primary} disabled={p.problems.length > 0}>
                Approve at this markup
              </button>
              <button type="submit" name="decision" value="rejected" className={styles.secondary} data-confirm={`Reject ${p.name}?`}>
                Reject
              </button>
            </div>
          </ActionForm>
        </section>
      ))}
    </>
  );
}

const changeLabels: Record<string, string> = {
  name: 'Name',
  brand: 'Brand',
  department: 'Department',
  category_id: 'Category',
  summary: 'Summary',
  description: 'Description',
  ingredients: 'Ingredients',
};

/** Shows what the vendor changed on a product that was already approved, so you review only the difference. */
function ChangedFields({ before, after }: { before: Record<string, string | null>; after: ReviewRow }) {
  const now = after as unknown as Record<string, string | null>;
  const changed = Object.keys(changeLabels).filter((key) => (before[key] ?? '') !== (now[key] ?? ''));
  return (
    <div className={styles.notice} role="note">
      <strong>Changed since you approved it</strong>
      {changed.length === 0 ? (
        <p>Only the price or photos changed.</p>
      ) : (
        <dl className={styles.facts}>
          {changed.map((key) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{changeLabels[key]}</dt>
              <dd>
                <s>{before[key] || 'empty'}</s> → {now[key] || 'empty'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

async function PickupsTab({ staff }: { staff: Staff }) {
  const { data, error } = await staff.supabase.rpc('admin_vendor_shipments');
  if (error) throw error;
  const shipments = data as unknown as Shipment[];
  if (shipments.length === 0) return <p className={styles.empty}>No vendor items are waiting to be collected.</p>;
  return (
    <>
      <p className={styles.muted}>Take each vendor’s packed bag, then mark it collected. An order can’t go out for delivery until all its vendor items are collected.</p>
      {shipments.map((sh) => (
        <section key={`${sh.order_id}-${sh.vendor_id}`} className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>
              {sh.order_number} · {sh.vendor_name}
            </h2>
            <span className={styles.badge} data-tone={sh.status === 'packed' ? 'good' : 'warn'}>
              {sh.status === 'packed' ? 'Packed, ready to collect' : 'Vendor is still packing'}
            </span>
          </div>
          <ul>
            {sh.items.map((i, n) => (
              <li key={n}>
                {i.quantity} × {i.name}
                {i.size ? ` (${i.size})` : ''}
              </li>
            ))}
          </ul>
          {sh.vendor_phone && <p className={styles.muted}>Call {sh.vendor_phone}</p>}
          {sh.status === 'packed' && (
            <ActionForm action={collectItems.bind(null, sh.order_id, sh.vendor_id)} confirm={`Have you collected the items from ${sh.vendor_name}?`}>
              <div className={styles.buttons}>
                <button type="submit" className={styles.primary}>
                  Mark as collected
                </button>
              </div>
            </ActionForm>
          )}
        </section>
      ))}
    </>
  );
}

async function PayoutsTab({ staff }: { staff: Staff }) {
  const [balances, payouts] = await Promise.all([staff.supabase.rpc('admin_vendor_balances'), staff.supabase.rpc('admin_vendor_payouts', { p_limit: 30 })]);
  if (balances.error) throw balances.error;
  if (payouts.error) throw payouts.error;
  const owed = balances.data as unknown as Balance[];
  const history = payouts.data as unknown as Payout[];
  const totalOwed = owed.reduce((n, b) => n + Number(b.balance), 0);
  return (
    <>
      <p className={styles.muted}>
        Vendors earn their own price once an order is delivered; returned items come off. Pay them by Mobile Money, then record it here. Owed in total: <strong>{formatPrice(totalOwed)}</strong>.
      </p>
      {owed.length === 0 && <p className={styles.empty}>No vendors yet.</p>}
      {owed.map((b) => (
        <section key={b.vendor_id} className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>{b.name}</h2>
            <strong>{formatPrice(b.balance)}</strong>
          </div>
          <p className={styles.muted}>
            Earned {formatPrice(b.earned)} · returns {formatPrice(b.returned)} · paid {formatPrice(b.paid)} · {formatPrice(b.pending)} still to be delivered
          </p>
          <p className={styles.muted}>
            {b.payout_wallet ? `Pay to ${b.payout_network?.toUpperCase()} ${b.payout_wallet} (${b.payout_name})` : 'No payout account saved yet.'}
          </p>
          {b.balance > 0 && (
            <ActionForm action={recordPayout.bind(null, b.vendor_id)} resetOnSuccess>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Amount paid (GH₵)</span>
                  <input name="amount" type="number" min={0.01} max={b.balance} step="0.01" required defaultValue={b.balance} />
                </label>
                <label className={styles.field}>
                  <span>Paid by</span>
                  <select name="method" defaultValue="momo">
                    <option value="momo">Mobile Money</option>
                    <option value="bank">Bank transfer</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Transaction reference</span>
                  <input name="reference" required maxLength={100} />
                </label>
              </div>
              <div className={styles.buttons}>
                <button type="submit" className={styles.secondary} data-confirm={`Record this payment to ${b.name}? They will be told by SMS.`}>
                  Mark as paid
                </button>
              </div>
            </ActionForm>
          )}
        </section>
      ))}
      {history.length > 0 && (
        <section className={styles.panel}>
          <h2>Recent payments</h2>
          <ul>
            {history.map((p) => (
              <li key={p.id}>
                {dateText(p.created_at)} · {p.vendor_name} · {formatPrice(p.amount_ghs)} · {p.method} · ref {p.reference}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

async function MessagesTab({ staff, vendor }: { staff: Staff; vendor: string | null }) {
  const { data, error } = await staff.supabase.rpc('admin_vendor_threads');
  if (error) throw error;
  const threads = data as unknown as Thread[];
  let open: { sender: 'vendor' | 'owner'; body: string; created_at: string }[] = [];
  const current = threads.find((t) => t.vendor_id === vendor);
  if (current) {
    const thread = await staff.supabase.rpc('admin_vendor_thread', { p_vendor_id: current.vendor_id });
    if (thread.error) throw thread.error;
    open = thread.data as unknown as typeof open;
  }
  if (threads.length === 0) return <p className={styles.empty}>No vendor has written to you yet.</p>;
  return (
    <>
      <nav className={styles.tabs} aria-label="Conversations">
        {threads.map((t) => (
          <Link key={t.vendor_id} href={`/admin/vendors?tab=messages&vendor=${t.vendor_id}`} aria-current={t.vendor_id === vendor ? 'page' : undefined}>
            {t.vendor_name}
            {t.unread > 0 ? ` (${t.unread} new)` : ''}
          </Link>
        ))}
      </nav>
      {current ? (
        <section className={styles.panel}>
          <h2>{current.vendor_name}</h2>
          <ul>
            {open.map((m, i) => (
              <li key={i}>
                <strong>{m.sender === 'vendor' ? current.vendor_name : 'You'}</strong> · {dateText(m.created_at)}
                <br />
                {m.body}
              </li>
            ))}
          </ul>
          <ActionForm action={replyToVendor.bind(null, current.vendor_id)} resetOnSuccess>
            <label className={styles.field}>
              <span>Your reply</span>
              <textarea name="body" rows={3} required maxLength={2000} />
            </label>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Send reply
              </button>
            </div>
          </ActionForm>
        </section>
      ) : (
        <p className={styles.muted}>Choose a conversation above.</p>
      )}
    </>
  );
}

async function SettingsTab({ staff }: { staff: Staff }) {
  const { data: s, error } = await staff.supabase.from('store_settings').select('*').single();
  if (error) throw error;
  return (
    <ActionForm action={saveMarketplaceSettings}>
      <section className={styles.panel}>
        <h2>Subscription</h2>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Yearly fee (GH₵)</span>
            <input name="vendor_annual_fee_ghs" type="number" min={0} step="0.01" required defaultValue={s.vendor_annual_fee_ghs} />
          </label>
          <label className={styles.field}>
            <span>Grace days after the year ends</span>
            <input name="vendor_grace_days" type="number" min={0} max={60} required defaultValue={s.vendor_grace_days} />
            <small>The store stays open this long while the vendor renews.</small>
          </label>
        </div>
        <label className={styles.field}>
          <span>How vendors pay you</span>
          <textarea
            name="vendor_payment_instructions"
            rows={3}
            maxLength={1000}
            defaultValue={s.vendor_payment_instructions ?? ''}
            placeholder="e.g. Send the fee by Mobile Money to 024 000 0000 (Sleek Connect) and use your store name as the reference."
          />
          <small>Shown to approved vendors on their dashboard. You record each payment on the Vendors tab.</small>
        </label>
      </section>
      <section className={styles.panel}>
        <h2>Markup and orders</h2>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Suggested markup (%)</span>
            <input name="default_markup_percent" type="number" min={0} max={200} step="0.5" required defaultValue={s.default_markup_percent} />
            <small>Pre-filled when you review a product. You can change it for each product.</small>
          </label>
        </div>
        <label className={styles.check}>
          <input type="checkbox" name="marketplace_orders_open" defaultChecked={s.marketplace_orders_open} />
          Shoppers can order vendor products
        </label>
        <p className={styles.muted}>Keep this off until vendors can pack and hand over orders.</p>
        <div className={styles.buttons}>
          <button type="submit" className={styles.primary}>
            Save settings
          </button>
        </div>
      </section>
    </ActionForm>
  );
}
