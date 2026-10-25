import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { vendorAssetUrl } from '@/lib/photos';
import { getVendorSession, type VendorProduct } from '@/lib/vendor';
import { applyForStore, saveStore, setStock } from './actions';
import { ImageUploader } from './ImageUploader';
import { VendorForm } from './VendorForm';
import styles from './vendor.module.css';

const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const reviewLabels = {
  draft: ['Removed', 'off'],
  pending: ['Waiting for approval', 'warn'],
  approved: ['Approved', 'good'],
  rejected: ['Not approved', 'bad'],
} as const;

export default async function VendorHome() {
  const session = await getVendorSession();

  if (session.state === 'signed_out') {
    return (
      <>
        <h1>Sell on Sleek Connect</h1>
        <p className={styles.lead}>Sign in with the account you want to run your store from.</p>
        <Link href="/account?next=/vendor" className={styles.primary}>
          Sign in to continue
        </Link>
        <p className={styles.muted}>
          New here? <Link href="/sell">See how selling works</Link>.
        </p>
      </>
    );
  }

  const { vendor } = session;
  if (!vendor) {
    return (
      <>
        <h1>Open your store</h1>
        <p className={styles.lead}>Tell us about your business. We review every application, then you pay the yearly fee and your storefront opens.</p>
        <VendorForm action={applyForStore}>
          <label className={styles.field}>
            <span>Store name</span>
            <input name="name" required minLength={2} maxLength={60} autoComplete="organization" />
          </label>
          <label className={styles.field}>
            <span>Phone number we can reach you on</span>
            <input name="phone" type="tel" required autoComplete="tel" placeholder="024 123 4567" />
          </label>
          <label className={styles.field}>
            <span>One line about what you sell (optional)</span>
            <input name="tagline" maxLength={120} placeholder="e.g. Natural shea products made in Tamale" />
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="terms" required />
            <span>
              I agree to the <Link href="/sell#terms">vendor terms</Link>.
            </span>
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Send application
            </button>
          </div>
        </VendorForm>
      </>
    );
  }

  if (vendor.status === 'pending') {
    return (
      <>
        <h1>{vendor.name}</h1>
        <p className={styles.lead}>Thanks for applying. We are reviewing your application and will call or email you soon.</p>
      </>
    );
  }

  if (vendor.status === 'rejected' || vendor.status === 'suspended') {
    return (
      <>
        <h1>{vendor.name}</h1>
        <p className={styles.lead}>
          {vendor.status === 'rejected' ? 'We could not approve this application.' : 'This store is paused.'}
          {vendor.review_note ? ` ${vendor.review_note}` : ''}
        </p>
        <p className={styles.muted}>If you think this is a mistake, contact us from the Help page.</p>
      </>
    );
  }

  if (!vendor.live) {
    const renewing = Boolean(vendor.paid_until);
    return (
      <>
        <h1>{vendor.name}</h1>
        <section className={styles.panel}>
          <h2>{renewing ? 'Renew your subscription' : 'One step left: pay for your first year'}</h2>
          <p>
            {renewing ? `Your subscription ended on ${dateText(vendor.paid_until!)}. ` : 'You are approved. '}
            The yearly fee is <strong>{formatPrice(vendor.annual_fee_ghs)}</strong>. Once we record your payment, your storefront opens
            and you can add products.
          </p>
          {vendor.payment_instructions ? (
            <p className={styles.instructions}>{vendor.payment_instructions}</p>
          ) : (
            <p className={styles.muted}>Contact us from the Help page to arrange payment.</p>
          )}
          <p className={styles.muted}>Payments are recorded by hand, usually within a working day.</p>
        </section>
      </>
    );
  }

  const [{ data: products, error }] = await Promise.all([session.supabase.rpc('vendor_my_products')]);
  if (error) throw error;
  const items = (products as unknown as VendorProduct[]) ?? [];
  const closesSoon = vendor.paid_until ? Math.ceil((Date.parse(vendor.paid_until) - new Date().getTime()) / 864e5) : null;

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>{vendor.name}</h1>
          <p className={styles.muted}>
            Your storefront: <Link href={`/store/${vendor.slug}`}>/store/{vendor.slug}</Link>
            {vendor.paid_until ? ` · Subscription paid until ${dateText(vendor.paid_until)}` : ''}
          </p>
        </div>
        <Link href="/vendor/products/new" className={styles.primary}>
          Add a product
        </Link>
      </div>
      {closesSoon !== null && closesSoon <= 30 && (
        <p className={styles.notice}>
          Your subscription {closesSoon < 0 ? 'has ended' : `ends in ${closesSoon} day${closesSoon === 1 ? '' : 's'}`}. Pay the yearly fee of{' '}
          {formatPrice(vendor.annual_fee_ghs)} to keep your store open. {vendor.payment_instructions ?? ''}
        </p>
      )}

      <section className={styles.panel}>
        <h2>Products</h2>
        {items.length === 0 ? (
          <p className={styles.muted}>No products yet. Add your first product; Sleek Connect reviews it and sets the price shoppers see.</p>
        ) : (
          <ul className={styles.products}>
            {items.map((p) => {
              const [label, tone] = reviewLabels[p.review_status];
              return (
                <li key={p.id} className={styles.product}>
                  <div className={styles.productHead}>
                    <Link href={`/vendor/products/${p.id}`} className={styles.productName}>
                      {p.name}
                    </Link>
                    <span className={styles.badge} data-tone={tone}>
                      {p.is_published ? 'On sale' : label}
                    </span>
                  </div>
                  <p className={styles.muted}>
                    Your price {formatPrice(p.vendor_price_ghs)}
                    {p.shopper_price_ghs !== null ? ` · shoppers pay ${formatPrice(p.shopper_price_ghs)}` : ''}
                    {p.review_note ? ` · Note from us: ${p.review_note}` : ''}
                  </p>
                  {p.problems.length > 0 && <p className={styles.warn}>Still needed: {p.problems.join(', ')}.</p>}
                  <div className={styles.stocks}>
                    {(p.sizes.length ? p.sizes : [{ code: '', label: 'In stock', stock: p.one_size_stock ?? 0 }]).map((s) => (
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

      <section className={styles.panel}>
        <h2>Store page</h2>
        <div className={styles.row}>
          <div>
            <h3>Logo</h3>
            <ImageUploader vendorId={vendor.id} kind="logo" url={vendorAssetUrl(vendor.logo_path)} />
          </div>
          <div>
            <h3>Banner</h3>
            <ImageUploader vendorId={vendor.id} kind="banner" url={vendorAssetUrl(vendor.banner_path)} />
          </div>
        </div>
        <VendorForm action={saveStore}>
          <label className={styles.field}>
            <span>Store name</span>
            <input name="name" required minLength={2} maxLength={60} defaultValue={vendor.name} />
          </label>
          <label className={styles.field}>
            <span>One line about your store</span>
            <input name="tagline" maxLength={120} defaultValue={vendor.tagline ?? ''} />
          </label>
          <label className={styles.field}>
            <span>About your store</span>
            <textarea name="description" rows={4} maxLength={2000} defaultValue={vendor.description ?? ''} />
          </label>
          <label className={styles.field}>
            <span>Phone number (private, for Sleek Connect only)</span>
            <input name="phone" type="tel" defaultValue={vendor.phone ?? ''} />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Save store details
            </button>
          </div>
        </VendorForm>
      </section>
    </>
  );
}
