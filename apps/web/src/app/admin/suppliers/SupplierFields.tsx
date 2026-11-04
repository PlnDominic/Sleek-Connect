import { momoNetworks } from '@sleek/shared';
import styles from '../admin.module.css';

export interface Supplier {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  business_type: 'individual' | 'company' | null;
  legal_name: string | null;
  tin: string | null;
  business_registration: string | null;
  payout_network: string | null;
  payout_wallet: string | null;
  payout_name: string | null;
  products: number;
  pending_products: number;
  on_sale: number;
  balance: { owed?: number; payable?: number; paid?: number; balance?: number } | null;
}

/** The fields of a supplier record: who they are, how to reach them, their tax details, and where we pay them. */
export function SupplierFields({ supplier }: { supplier?: Supplier }) {
  return (
    <>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Supplier name</span>
          <input name="name" required minLength={2} maxLength={60} defaultValue={supplier?.name} />
          <small>Shown to shoppers as the brand, for example “From Ama Naturals”.</small>
        </label>
        <label className={styles.field}>
          <span>One line about them (optional)</span>
          <input name="tagline" maxLength={120} defaultValue={supplier?.tagline ?? ''} />
        </label>
      </div>
      <label className={styles.field}>
        <span>Their story (optional)</span>
        <textarea name="description" rows={3} maxLength={2000} defaultValue={supplier?.description ?? ''} />
      </label>
      <h3>Contact</h3>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Contact person</span>
          <input name="contact_name" maxLength={80} defaultValue={supplier?.contact_name ?? ''} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Phone</span>
          <input name="phone" type="tel" defaultValue={supplier?.phone ?? ''} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input name="email" type="email" defaultValue={supplier?.email ?? ''} autoComplete="off" />
        </label>
      </div>
      <h3>Tax details (needed before we pay them)</h3>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Supplies as</span>
          <select name="business_type" defaultValue={supplier?.business_type ?? 'individual'}>
            <option value="individual">An individual</option>
            <option value="company">A registered business</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Legal name</span>
          <input name="legal_name" maxLength={120} defaultValue={supplier?.legal_name ?? ''} />
        </label>
        <label className={styles.field}>
          <span>TIN</span>
          <input name="tin" maxLength={20} defaultValue={supplier?.tin ?? ''} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Business registration no.</span>
          <input name="business_registration" maxLength={40} defaultValue={supplier?.business_registration ?? ''} autoComplete="off" />
        </label>
      </div>
      <h3>Where we pay them</h3>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Mobile Money network</span>
          <select name="payout_network" defaultValue={supplier?.payout_network ?? ''}>
            <option value="">Not set</option>
            {momoNetworks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Mobile Money number</span>
          <input name="payout_wallet" type="tel" defaultValue={supplier?.payout_wallet ?? ''} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Name on the wallet</span>
          <input name="payout_name" maxLength={80} defaultValue={supplier?.payout_name ?? ''} autoComplete="off" />
        </label>
      </div>
    </>
  );
}
