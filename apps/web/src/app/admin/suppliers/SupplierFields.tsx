import type { ReactNode } from 'react';
import styles from '../admin.module.css';

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  products: number;
  deliveries: number;
  units_received: number;
  total_cost_ghs: number;
  last_delivery: string | null;
  // Only returned to admin and finance staff.
  business_type?: string | null;
  legal_name?: string | null;
  tin?: string | null;
  business_registration?: string | null;
  payout_network?: string | null;
  payout_wallet?: string | null;
  payout_name?: string | null;
}

/** The fields of a supplier. Tax and payment details are shown only when `money` is true (finance and admin). */
export function SupplierFields({ supplier, money, children }: { supplier?: Supplier; money: boolean; children?: ReactNode }) {
  return (
    <>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Supplier name</span>
          <input name="name" required minLength={2} maxLength={80} defaultValue={supplier?.name} />
        </label>
        <label className={styles.field}>
          <span>Contact person</span>
          <input name="contact_name" maxLength={80} defaultValue={supplier?.contact_name ?? ''} />
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Phone</span>
          <input name="phone" type="tel" defaultValue={supplier?.phone ?? ''} />
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input name="email" type="email" defaultValue={supplier?.email ?? ''} />
        </label>
      </div>
      <label className={styles.field}>
        <span>Address</span>
        <input name="address" maxLength={300} defaultValue={supplier?.address ?? ''} />
      </label>
      <label className={styles.field}>
        <span>Payment terms</span>
        <input name="payment_terms" maxLength={300} defaultValue={supplier?.payment_terms ?? ''} placeholder="e.g. Pay within 14 days of delivery" />
      </label>
      {money && (
        <>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Type</span>
              <select name="business_type" defaultValue={supplier?.business_type ?? ''}>
                <option value="">Not recorded</option>
                <option value="individual">Individual</option>
                <option value="company">Registered business</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Registered name</span>
              <input name="legal_name" maxLength={120} defaultValue={supplier?.legal_name ?? ''} />
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>TIN (tax number)</span>
              <input name="tin" maxLength={20} defaultValue={supplier?.tin ?? ''} />
            </label>
            <label className={styles.field}>
              <span>Business registration number</span>
              <input name="business_registration" maxLength={60} defaultValue={supplier?.business_registration ?? ''} />
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Mobile Money network</span>
              <select name="payout_network" defaultValue={supplier?.payout_network ?? ''}>
                <option value="">Not recorded</option>
                <option value="mtn">MTN</option>
                <option value="telecel">Telecel</option>
                <option value="at">AT</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Mobile Money number</span>
              <input name="payout_wallet" type="tel" defaultValue={supplier?.payout_wallet ?? ''} />
            </label>
            <label className={styles.field}>
              <span>Name on the wallet</span>
              <input name="payout_name" maxLength={80} defaultValue={supplier?.payout_name ?? ''} />
            </label>
          </div>
        </>
      )}
      <label className={styles.field}>
        <span>Notes</span>
        <textarea name="notes" rows={3} maxLength={1000} defaultValue={supplier?.notes ?? ''} />
      </label>
      {children}
    </>
  );
}
