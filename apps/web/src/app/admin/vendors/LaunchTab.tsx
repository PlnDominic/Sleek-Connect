import Link from 'next/link';
import { getPaymentProvider } from '@/lib/payments';
import { vendorTermsVersion } from '@/lib/vendor-terms';
import type { Staff } from './page';
import styles from '../admin.module.css';

interface VendorSummary {
  status: string;
  live: boolean;
  products: number;
  pending_products: number;
}

type Item = { ok: boolean; title: string; detail: string };

/**
 * Is the marketplace ready for real orders? Each line is checked from live settings and data; the rehearsals at the bottom are
 * the three things only a person can prove by doing them once.
 */
export async function LaunchTab({ staff }: { staff: Staff }) {
  const [{ data: settings }, { data: vendorData }, { data: disputes }] = await Promise.all([
    staff.supabase.from('store_settings').select('*').single(),
    staff.supabase.rpc('admin_vendors'),
    staff.supabase.rpc('admin_vendor_disputes'),
  ]);
  const vendors = (vendorData ?? []) as unknown as VendorSummary[];
  const live = vendors.filter((v) => v.live);
  const overdue = ((disputes ?? []) as unknown as { overdue: boolean }[]).filter((d) => d.overdue).length;
  const provider = getPaymentProvider();
  const skipCheck = process.env.HUBTEL_SKIP_STATUS_CHECK?.toLowerCase() === 'true';

  const items: Item[] = [
    {
      ok: provider !== null && !provider.testMode,
      title: 'A real payment provider is connected',
      detail: provider ? (provider.testMode ? 'It is the test provider: no real money moves.' : `${provider.name} is connected.`) : 'PAYMENT_PROVIDER is not set. Vendors can’t pay the yearly fee online and shoppers can’t pay online. See docs/HUBTEL.md.',
    },
    {
      ok: provider?.name === 'hubtel' ? !skipCheck : provider !== null && !provider.testMode,
      title: 'Payments are confirmed with the provider',
      detail: skipCheck ? 'HUBTEL_SKIP_STATUS_CHECK is on: callbacks are accepted without asking Hubtel. Get your server IP whitelisted and turn it off.' : 'Each payment is checked with the provider before an order or subscription is marked paid.',
    },
    { ok: (settings?.vendor_annual_fee_ghs ?? 0) > 0, title: 'The yearly fee is set', detail: `Currently GH₵ ${settings?.vendor_annual_fee_ghs ?? 0}. Change it under Marketplace settings.` },
    {
      ok: Boolean(settings?.support_phone || settings?.support_email || settings?.support_whatsapp),
      title: 'Vendors have a way to reach you',
      detail: 'Set a support phone, WhatsApp or email under Admin → Settings. Vendors see it on their Help page, with your reply time of ' + (settings?.vendor_support_reply_hours ?? 24) + ' hours.',
    },
    { ok: true, title: 'Seller terms and product standards are published', detail: `Version ${vendorTermsVersion}: /sell/terms and /sell/standards. Have a lawyer review them before launch.` },
    { ok: (settings?.vendor_payout_hold_days ?? 7) >= 1 && (settings?.vendor_tin_required ?? true), title: 'Payout rules protect you', detail: `Earnings are held ${settings?.vendor_payout_hold_days ?? 7} days after delivery, and a tax number is ${settings?.vendor_tin_required === false ? 'NOT ' : ''}required before payouts.` },
    { ok: live.length > 0, title: 'At least one store is live', detail: `${live.length} live store${live.length === 1 ? '' : 's'} (approved and paid). ${vendors.filter((v) => v.status === 'pending').length} waiting for approval.` },
    { ok: overdue === 0, title: 'No dispute replies are overdue', detail: overdue === 0 ? 'All vendor replies are in time.' : `${overdue} case${overdue === 1 ? ' is' : 's are'} past the 48-hour reply time.` },
    {
      ok: settings?.marketplace_orders_open === true,
      title: 'Shoppers can order from vendor stores',
      detail: settings?.marketplace_orders_open ? 'Open.' : 'Still closed. Turn it on under Marketplace settings only after the three rehearsals below.',
    },
  ];
  const ready = items.filter((i) => i.ok).length;

  return (
    <>
      <p className={styles.muted}>
        {ready} of {items.length} ready. This page reads your live settings; fix what is red, do the three rehearsals, then open ordering.
      </p>
      <section className={styles.panel}>
        <ul className={styles.form}>
          {items.map((i) => (
            <li key={i.title}>
              <span className={styles.badge} data-tone={i.ok ? 'good' : 'warn'}>
                {i.ok ? 'Ready' : 'To do'}
              </span>{' '}
              <strong>{i.title}</strong>
              <div className={styles.muted}>{i.detail}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>Rehearsal 1: a vendor order, start to finish</h2>
        <ol>
          <li>Make a test vendor store (your own email), approve it with the checklist, record or pay its yearly fee, and add a cheap product; approve it.</li>
          <li>Temporarily turn “Shoppers can order vendor products” on. As a shopper, buy that product with a real small payment (Mobile Money or card).</li>
          <li>Check the order becomes paid and the vendor sees it under Orders (without the shopper’s details).</li>
          <li>As the vendor mark it packed. On the Pickups tab mark it collected. Pack the rest, dispatch, and mark it delivered with the code.</li>
          <li>Check the vendor’s Earnings show the delivery, and that the shopper got every message. Turn ordering off again until you are happy.</li>
        </ol>
      </section>
      <section className={styles.panel}>
        <h2>Rehearsal 2: a payout</h2>
        <ol>
          <li>Give the test vendor a payout account (Mobile Money) and their tax details.</li>
          <li>Wait out the hold (or set “Hold after delivery” to 0 for the test), then record a payout with the real transaction reference after sending it by Mobile Money.</li>
          <li>Check the vendor sees the payout and gets the text, the balance goes down, and a payout above what is payable is refused.</li>
        </ol>
      </section>
      <section className={styles.panel}>
        <h2>Rehearsal 3: subscription billing</h2>
        <ol>
          <li>As the test vendor, pay the yearly fee online through the provider. Check the store opens (the webhook confirms it) and the vendor is told.</li>
          <li>Renew when it is near its end, and check the new year adds to the old one, not from today.</li>
          <li>Let one lapse (record a payment that ended yesterday): after the grace days its store and products come off the site, and the vendor is reminded before that.</li>
        </ol>
        <p className={styles.muted}>
          The same steps with the exact wording are in <code>docs/VENDOR_LAUNCH.md</code>. The settings are under{' '}
          <Link href="/admin/vendors?tab=settings">Marketplace settings</Link>.
        </p>
      </section>
    </>
  );
}
