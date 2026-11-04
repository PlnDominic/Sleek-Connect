import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { createUserSupabase } from '@/lib/supabase/server';
import { ActionForm } from '../ActionForm';
import { createSupplier, setVendorAccountsOpen } from './actions';
import { SupplierFields, type Supplier } from './SupplierFields';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'vendors.manage')) return <p className={styles.notice}>Only admins can manage suppliers.</p>;
  const { data, error } = await staff.supabase.rpc('admin_list_suppliers');
  if (error) return <p className={styles.notice}>Suppliers aren’t available yet. The database update for suppliers hasn’t been applied.</p>;
  const suppliers = (data as unknown as Supplier[]) ?? [];
  const supabase = await createUserSupabase();
  const { data: settings } = await supabase.from('store_settings').select('vendor_accounts_open').single();

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Suppliers</h1>
          <p className={styles.muted}>
            The people and brands whose products you sell. Shoppers pay Sleek Connect, you buy from the supplier at their price, and you pay them for what has been
            delivered. Suppliers don’t sign in: you enter their products, prices and stock.
          </p>
        </div>
      </div>

      <section className={styles.panel} aria-labelledby="new-supplier">
        <h2 id="new-supplier">Add a supplier</h2>
        <ActionForm action={createSupplier}>
          <SupplierFields />
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Add supplier
            </button>
          </div>
        </ActionForm>
      </section>

      {suppliers.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.empty}>No suppliers yet.</p>
        </section>
      ) : (
        <section className={styles.panel} aria-labelledby="supplier-list">
          <h2 id="supplier-list">Your suppliers</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {suppliers.map((s) => (
              <li key={s.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <strong>
                    <Link href={`/admin/suppliers/${s.id}`}>{s.name}</Link>
                  </strong>
                  <br />
                  <span className={styles.muted}>
                    {s.products} {s.products === 1 ? 'product' : 'products'} · {s.on_sale} on sale
                    {s.pending_products > 0 ? ` · ${s.pending_products} waiting for approval` : ''}
                    {!s.tin ? ' · no tax details yet' : ''}
                    {!s.payout_wallet ? ' · no payout number yet' : ''}
                  </span>
                </span>
                <span className={styles.muted}>Owed now: {formatPrice(Number(s.balance?.payable ?? 0))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.panel} aria-labelledby="own-stores">
        <h2 id="own-stores">Sellers opening their own stores</h2>
        <p className={styles.muted}>
          Off by default. When it is off nobody can create a seller account, and /sell explains how to supply you instead. Only switch it on if your payment
          partner allows you to collect money on sellers’ behalf.
        </p>
        <ActionForm action={setVendorAccountsOpen}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="open" defaultChecked={settings?.vendor_accounts_open === true} />
            Let sellers open their own stores
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.secondary}>
              Save
            </button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
