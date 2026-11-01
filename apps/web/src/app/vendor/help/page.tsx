import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getVendorSession } from '@/lib/vendor';
import { vendorTermsVersion } from '@/lib/vendor-terms';
import { acceptTerms } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Help and terms' };

interface Launch {
  terms_version: string | null;
  terms_accepted_at: string | null;
  support: { phone: string | null; whatsapp: string | null; email: string | null; hours: string | null; reply_hours: number };
}

export default async function VendorHelpPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor) redirect('/vendor');
  const { data } = await session.supabase.rpc('vendor_launch_state');
  const launch = data as unknown as Launch | null;
  const support = launch?.support;
  const upToDate = launch?.terms_version === vendorTermsVersion;

  return (
    <>
      <section className={styles.panel}>
        <h2>Reaching us</h2>
        <p>
          Send us a message from <Link href="/vendor/messages">Messages</Link> for anything about your store, orders, products or payments. We reply within{' '}
          <strong>{support?.reply_hours ?? 24} hours</strong> on working days, and text you when we do.
        </p>
        {(support?.phone || support?.whatsapp || support?.email) && (
          <ul>
            {support.phone && <li>Phone: {support.phone}</li>}
            {support.whatsapp && <li>WhatsApp: {support.whatsapp}</li>}
            {support.email && <li>Email: {support.email}</li>}
            {support.hours && <li>Hours: {support.hours}</li>}
          </ul>
        )}
        <p className={styles.muted}>For something urgent, such as an order you can’t fulfil, call rather than write.</p>
      </section>

      <section className={styles.panel}>
        <h2>Rules to know</h2>
        <ul>
          <li>
            <Link href="/sell/terms">Seller terms</Link>: fees, prices, orders, payouts, returns and disputes, and what may not be sold.
          </li>
          <li>
            <Link href="/sell/standards">Product standards</Link>: what we check before a product goes on the store.
          </li>
          <li>
            <Link href="/vendor/disputes">Disputes</Link>: when a shopper reports a problem, you have 48 hours to reply.
          </li>
          <li>
            <Link href="/vendor/earnings">Earnings</Link>: what is payable, the hold, and where to add your tax details.
          </li>
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>Your agreement</h2>
        {upToDate ? (
          <p>
            You accepted version {launch?.terms_version} of the seller terms
            {launch?.terms_accepted_at ? ` on ${new Date(launch.terms_accepted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' })}` : ''}.
          </p>
        ) : (
          <VendorForm action={acceptTerms}>
            <p>
              The seller terms have been updated (version {vendorTermsVersion}). Please read the <Link href="/sell/terms">new terms</Link> and accept them to keep adding and changing products.
            </p>
            <label className={styles.check}>
              <input type="checkbox" name="accept" required />I have read the seller terms and the product standards and I accept them
            </label>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Accept
              </button>
            </div>
          </VendorForm>
        )}
      </section>
    </>
  );
}
