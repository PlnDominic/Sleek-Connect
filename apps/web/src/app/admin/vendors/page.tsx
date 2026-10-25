import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { Flash } from '../Flash';
import { recordSubscription, reviewProduct, reviewVendor, saveMarketplaceSettings } from './actions';
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
}

const tabs = [
  { id: 'vendors', label: 'Vendors' },
  { id: 'products', label: 'Products to review' },
  { id: 'settings', label: 'Marketplace settings' },
] as const;
type Tab = (typeof tabs)[number]['id'];

const statusLabels = { pending: 'Waiting for approval', active: 'Approved', suspended: 'Suspended', rejected: 'Rejected' } as const;
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
          <p className={styles.muted}>Approve stores, record yearly subscription payments and set the markup on each vendor product.</p>
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
                <button type="submit" name="decision" value="rejected" className={styles.secondary}>
                  Reject
                </button>
              )}
              {v.status === 'active' && (
                <button type="submit" name="decision" value="suspended" className={styles.danger}>
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
      {items.map((p) => (
        <section key={p.id} className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>{p.name}</h2>
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
              <button type="submit" name="decision" value="rejected" className={styles.secondary}>
                Reject
              </button>
            </div>
          </ActionForm>
        </section>
      ))}
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
        <p className={styles.muted}>
          Keep this off until vendors are ready to pack and hand over orders. Vendor products are visible but can’t be bought while it is off.
        </p>
        <div className={styles.buttons}>
          <button type="submit" className={styles.primary}>
            Save settings
          </button>
        </div>
      </section>
    </ActionForm>
  );
}
