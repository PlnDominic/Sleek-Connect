import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { momoNetworks } from '@sleek/shared';
import { getPaymentProvider } from '@/lib/payments';
import { getVendorSession, type VendorProduct } from '@/lib/vendor';
import { payOnline, setStock } from './actions';
import { ApplyForm } from './ApplyForm';
import { VendorForm } from './VendorForm';
import styles from './vendor.module.css';

const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const reviewLabels = {
  draft: ['Removed', 'off'],
  pending: ['Waiting for approval', 'warn'],
  approved: ['Approved', 'good'],
  rejected: ['Not approved', 'bad'],
} as const;

/** Asks for a Mobile Money number and sends the prompt for the yearly fee. */
function PayOnline() {
  return (
    <VendorForm action={payOnline}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Network</span>
          <select name="network" defaultValue="mtn">
            {momoNetworks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Mobile Money number</span>
          <input name="wallet" type="tel" required />
        </label>
      </div>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>
          Pay online
        </button>
      </div>
    </VendorForm>
  );
}

/** A single centred card: used for sign-in, applying and every waiting state. */
function StatusCard({ title, children, mark }: { title: string; children: React.ReactNode; mark: string }) {
  return (
    <section className={styles.statusCard}>
      <span className={styles.statusMark} aria-hidden="true">
        {mark}
      </span>
      <h1 className={styles.statusTitle}>{title}</h1>
      {children}
    </section>
  );
}

export default async function VendorHome() {
  const session = await getVendorSession();

  if (session.state === 'signed_out') {
    return (
      <StatusCard title="Sell on Sleek Connect" mark="→">
        <p className={styles.muted}>Sign in to open your store.</p>
        <Link href="/account?next=/vendor" className={styles.primary}>
          Sign in to continue
        </Link>
        <Link href="/sell" className={styles.quiet}>
          How selling works
        </Link>
      </StatusCard>
    );
  }

  const { vendor } = session;
  if (!vendor) {
    return (
      <StatusCard title="Open your store" mark="+">
        <ApplyForm email={session.email ?? ''} />
      </StatusCard>
    );
  }

  if (vendor.status === 'pending') {
    return (
      <StatusCard title="Application received" mark="✓">
        <p className={styles.muted}>We’ll review {vendor.name} and call you soon.</p>
      </StatusCard>
    );
  }

  if (vendor.status === 'rejected' || vendor.status === 'suspended') {
    return (
      <StatusCard title={vendor.status === 'rejected' ? 'Not approved' : 'Store paused'} mark="!">
        {vendor.review_note && <p className={styles.muted}>{vendor.review_note}</p>}
        <Link href="/help#contact" className={styles.quiet}>
          Contact us
        </Link>
      </StatusCard>
    );
  }

  const online = getPaymentProvider() !== null;
  if (!vendor.live) {
    const renewing = Boolean(vendor.paid_until);
    return (
      <StatusCard title={renewing ? 'Renew your subscription' : 'Pay to open your store'} mark="GH₵">
        <p className={styles.statusFee}>{formatPrice(vendor.annual_fee_ghs)}</p>
        <p className={styles.muted}>per year{renewing ? ` · ended ${dateText(vendor.paid_until!)}` : ''}</p>
        {online && <PayOnline />}
        {vendor.payment_instructions ? (
          <p className={styles.instructions}>{vendor.payment_instructions}</p>
        ) : (
          !online && (
            <Link href="/help#contact" className={styles.quiet}>
              Contact us to pay
            </Link>
          )
        )}
      </StatusCard>
    );
  }

  const [{ data: products, error }] = await Promise.all([session.supabase.rpc('vendor_my_products')]);
  if (error) throw error;
  const items = (products as unknown as VendorProduct[]) ?? [];
  const closesSoon = vendor.paid_until ? Math.ceil((Date.parse(vendor.paid_until) - new Date().getTime()) / 864e5) : null;

  return (
    <>
      {closesSoon !== null && closesSoon <= 30 && (
        <p className={styles.notice}>
          Your subscription {closesSoon < 0 ? 'has ended' : `ends in ${closesSoon} day${closesSoon === 1 ? '' : 's'}`}. Pay the yearly fee of{' '}
          {formatPrice(vendor.annual_fee_ghs)} to keep your store open. {online ? '' : (vendor.payment_instructions ?? '')}
        </p>
      )}
      {online && closesSoon !== null && closesSoon <= 30 && (
        <section className={styles.panel}>
          <h2>Renew online</h2>
          <PayOnline />
        </section>
      )}

      <div className={styles.stats}>
        <section className={styles.stat}>
          <h2>Products</h2>
          <strong>{items.length}</strong>
          <span>{items.filter((p) => p.is_published).length} on sale</span>
        </section>
        <section className={styles.stat}>
          <h2>Waiting for approval</h2>
          <strong>{items.filter((p) => p.review_status === 'pending').length}</strong>
          <span>We set the shopper price when we approve</span>
        </section>
        <section className={styles.stat}>
          <h2>Subscription</h2>
          <strong>{vendor.paid_until ? dateText(vendor.paid_until) : '–'}</strong>
          <span>{closesSoon !== null ? (closesSoon < 0 ? 'Ended' : `${closesSoon} day${closesSoon === 1 ? '' : 's'} left`) : 'Paid until'}</span>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Your products</h2>
          <Link href="/vendor/products/new" className={styles.primary}>
            Add a product
          </Link>
        </div>
        {items.length === 0 ? (
          <p className={styles.muted}>No products yet. Add your first one.</p>
        ) : (
          <ul className={styles.productGrid}>
            {items.map((p) => {
              const [label, tone] = reviewLabels[p.review_status];
              return (
                <li key={p.id} className={styles.productCard}>
                  <div className={styles.productHead}>
                    <Link href={`/vendor/products/${p.id}`} className={styles.productName}>
                      {p.name}
                    </Link>
                    <span className={styles.badge} data-tone={tone}>
                      {p.is_published ? 'On sale' : label}
                    </span>
                  </div>
                  <p className={styles.price}>
                    {formatPrice(p.vendor_price_ghs)}
                    {p.shopper_price_ghs !== null && <span> · shoppers pay {formatPrice(p.shopper_price_ghs)}</span>}
                  </p>
                  {p.problems.length > 0 && <p className={styles.warn}>Still needed: {p.problems.join(', ')}</p>}
                  <div className={styles.stocks}>
                    {(p.sizes.length ? p.sizes : [{ code: '', label: 'Stock', stock: p.one_size_stock ?? 0 }]).map((s) => (
                      <VendorForm key={s.code} action={setStock.bind(null, p.id, s.code)} className={styles.stock}>
                        <label>
                          <span>{s.label}</span>
                          <input name="quantity" type="number" min={0} step={1} defaultValue={s.stock} aria-label={`Stock for ${p.name}, ${s.label}`} />
                        </label>
                        <button type="submit" className={styles.secondary}>
                          Save
                        </button>
                      </VendorForm>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </>
  );
}
