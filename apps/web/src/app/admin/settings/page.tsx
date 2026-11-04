import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { businessDetails } from '@/lib/legal';
import { ActionForm } from '../ActionForm';
import { saveSettings, sendTestEmail, sendTestServerError } from './actions';
import { TestBrowserError } from './TestBrowserError';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'settings.edit')) {
    return <p className={styles.notice}>Only admins can change store settings.</p>;
  }
  const { data: s, error } = await staff.supabase.from('store_settings').select('*').single();
  if (error) throw error;
  // The company details the terms, privacy notice, footer and receipts print. They come from the server's environment
  // (Vercel → Environment Variables), so this only shows whether each is set, never changes it.
  const business = businessDetails();
  const details: [string, string, boolean][] = [
    ['Company name', 'BUSINESS_NAME', Boolean(business.name)],
    ['Registration number', 'BUSINESS_REGISTRATION_NUMBER', Boolean(business.registrationNumber)],
    ['Business address', 'BUSINESS_ADDRESS', Boolean(business.address)],
    ['Data Protection Commission number', 'DATA_PROTECTION_REGISTRATION_NUMBER', Boolean(business.dataProtectionNumber)],
    ['Tax identification number (TIN)', 'BUSINESS_TIN', Boolean(business.taxNumber)],
    ['Payment provider name', 'PAYMENT_PROVIDER_NAME', Boolean(business.paymentProvider)],
  ];
  const missing = details.filter(([, , set]) => !set).length;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Settings</h1>
          <p className={styles.muted}>Store-wide rules.</p>
        </div>
      </div>
      <section className={styles.panel} id="error-reporting" aria-labelledby="error-reporting-title">
        <h2 id="error-reporting-title">Error reporting</h2>
        <p className={styles.muted}>
          Errors on the server and in shoppers’ browsers are sent to Sentry, without personal details. Send one deliberate test error from each side to
          check it works: it should appear in Sentry → Issues within a minute, with your real file names in the details (not minified code).
        </p>
        <ActionForm action={sendTestServerError}>
          <div className={styles.buttons}>
            <button type="submit" className={styles.secondary}>
              Send a server test error
            </button>
          </div>
        </ActionForm>
        <TestBrowserError />
      </section>

      <section className={styles.panel} aria-labelledby="company-title">
        <h2 id="company-title">Company details on the legal pages</h2>
        <p className={styles.muted}>
          The terms, privacy notice, footer and receipts name your company when these are set, and leave the sentence out when they are not.
          Set them in Vercel → Environment Variables and redeploy.
          {missing > 0 ? ` ${missing} not set yet.` : ' All set.'}
        </p>
        <ul className={styles.form}>
          {details.map(([label, name, set]) => (
            <li key={name}>
              <span className={styles.badge} data-tone={set ? 'good' : 'warn'}>{set ? 'Set' : 'Not set'}</span> {label} <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <ActionForm action={saveSettings}>
        <section className={styles.panel}>
          <h2>Customer support</h2>
          <p className={styles.muted}>Shown in the help centre. Leave a field empty to hide it.</p>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Phone</span>
              <input name="support_phone" type="tel" defaultValue={s.support_phone ?? ''} placeholder="030 000 0000" />
            </label>
            <label className={styles.field}>
              <span>WhatsApp number</span>
              <input name="support_whatsapp" type="tel" defaultValue={s.support_whatsapp ?? ''} placeholder="024 000 0000" />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input name="support_email" type="email" defaultValue={s.support_email ?? ''} />
            </label>
            <label className={styles.field}>
              <span>Opening hours</span>
              <input name="support_hours" defaultValue={s.support_hours ?? ''} placeholder="Mon–Sat, 8am–6pm" />
            </label>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Orders and returns</h2>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Return window (days)</span>
              <input name="return_window_days" type="number" min={1} max={90} required defaultValue={s.return_window_days} />
              <small>Days after delivery that customers can request a return.</small>
            </label>
            <label className={styles.field}>
              <span>Payment hold (minutes)</span>
              <input name="reservation_minutes" type="number" min={1} max={240} required defaultValue={s.reservation_minutes} />
              <small>How long stock is held while a customer pays.</small>
            </label>
            <label className={styles.field}>
              <span>Delivery attempts</span>
              <input name="max_delivery_attempts" type="number" min={1} max={5} required defaultValue={s.max_delivery_attempts} />
              <small>Before an order comes back to us.</small>
            </label>
          </div>
          <label className={styles.check}>
            <input type="checkbox" name="require_delivery_code" defaultChecked={s.require_delivery_code} />
            Riders need the customer’s delivery code to complete a delivery
          </label>
        </section>

        <section className={styles.panel}>
          <h2>Pay on delivery</h2>
          <p className={styles.muted}>
            Shoppers pay the rider in cash. You confirm each order (usually with a call) before it is packed, and the cash is
            recorded when the rider hands the order over.
          </p>
          <label className={styles.check}>
            <input type="checkbox" name="pay_on_delivery_enabled" defaultChecked={s.pay_on_delivery_enabled} />
            Offer pay on delivery at checkout
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Hold for confirmation (hours)</span>
              <input name="pay_on_delivery_hold_hours" type="number" min={1} max={168} required defaultValue={s.pay_on_delivery_hold_hours} />
              <small>An order you haven’t confirmed by then is cancelled and its stock goes back on sale.</small>
            </label>
            <label className={styles.field}>
              <span>Largest order (GH₵)</span>
              <input name="pay_on_delivery_max_ghs" type="number" min={1} step="0.01" defaultValue={s.pay_on_delivery_max_ghs ?? ''} />
              <small>Leave empty for no limit. Bigger orders must be paid online.</small>
            </label>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Stock alerts</h2>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Low stock at</span>
              <input name="low_stock_threshold" type="number" min={0} required defaultValue={s.low_stock_threshold} />
              <small>Units left (products can override this).</small>
            </label>
            <label className={styles.field}>
              <span>Expiry alert (days)</span>
              <input name="expiry_alert_days" type="number" min={1} required defaultValue={s.expiry_alert_days} />
              <small>Flag batches expiring within this many days.</small>
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Supplier lead time (days)</span>
              <input name="reorder_lead_days" type="number" min={0} max={90} required defaultValue={s.reorder_lead_days} />
              <small>How long a new order takes to arrive. Used by the reorder suggestions.</small>
            </label>
            <label className={styles.field}>
              <span>Days of sales to cover</span>
              <input name="reorder_cover_days" type="number" min={1} max={180} required defaultValue={s.reorder_cover_days} />
              <small>How many days of sales one order should last, after it arrives.</small>
            </label>
          </div>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Save settings
            </button>
          </div>
        </section>
      </ActionForm>

      <ActionForm action={sendTestEmail}>
        <section className={styles.panel}>
          <h2>Email</h2>
          <p className={styles.muted}>Order emails are sent by the server. Send one test message to check it works.</p>
          <label className={styles.field}>
            <span>Send a test email to</span>
            <input name="to" type="email" required defaultValue={staff.email ?? ''} />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.secondary}>
              Send test email
            </button>
          </div>
        </section>
      </ActionForm>
    </>
  );
}
