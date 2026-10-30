import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { saveSettings, sendTestEmail } from './actions';
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

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Settings</h1>
          <p className={styles.muted}>Store-wide rules.</p>
        </div>
      </div>
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
          <p className={styles.muted}>Order and vendor emails are sent by the server. Send one test message to check it works.</p>
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
