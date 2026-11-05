import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { deleteSupplier, saveSupplier, setSupplierActive } from './actions';
import { SupplierFields, type Supplier } from './SupplierFields';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'suppliers.manage')) {
    return <p className={styles.notice}>Only operations, finance and admin staff can see suppliers.</p>;
  }
  const money = can(staff.role, 'suppliers.tax');
  const [{ data, error }, { data: balanceRows }] = await Promise.all([
    staff.supabase.rpc('admin_list_suppliers'),
    can(staff.role, 'profit.view') ? staff.supabase.rpc('admin_supplier_balances') : Promise.resolve({ data: null }),
  ]);
  const owed = new Map(((balanceRows ?? []) as unknown as { supplier_id: string; owed_ghs: number }[]).map((b) => [b.supplier_id, Number(b.owed_ghs)]));
  if (error) return <p className={styles.notice}>Suppliers aren’t available yet. The latest database update hasn’t been applied.</p>;
  const suppliers = (data as unknown as Supplier[]) ?? [];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Suppliers</h1>
          <p className={styles.muted}>Who we buy from. Pick the supplier when you receive stock under Inventory, and each delivery is kept here with its cost.</p>
        </div>
      </div>

      <section className={styles.panel} aria-labelledby="new-title">
        <h2 id="new-title">Add a supplier</h2>
        <ActionForm action={saveSupplier.bind(null, null)} resetOnSuccess>
          <SupplierFields money={money}>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Add supplier
              </button>
            </div>
          </SupplierFields>
        </ActionForm>
      </section>

      {suppliers.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.empty}>No suppliers yet.</p>
        </section>
      ) : (
        suppliers.map((s) => (
          <section key={s.id} className={styles.panel} aria-label={`Supplier ${s.name}`}>
            <div className={styles.panelHead}>
              <div>
                <h2>
                  <Link href={`/admin/suppliers/${s.id}`}>{s.name}</Link>{' '}
                  {!s.is_active && <span className={styles.badge}>Hidden</span>}
                </h2>
                <p className={styles.muted}>
                  {[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details yet'}
                </p>
                <p className={styles.muted}>
                  {s.deliveries} {s.deliveries === 1 ? 'delivery' : 'deliveries'} · {s.units_received} units · {formatPrice(Number(s.total_cost_ghs))} at cost · {s.products}{' '}
                  {s.products === 1 ? 'product' : 'products'}
                  {s.last_delivery ? ` · last ${formatDateTime(s.last_delivery)}` : ''}
                  {owed.has(s.id) && owed.get(s.id)! > 0 ? ` · we owe ${formatPrice(owed.get(s.id)!)}` : ''}
                </p>
              </div>
            </div>
            <div className={styles.buttons}>
              <Link href={`/admin/suppliers/${s.id}`} className={styles.secondary}>
                Deliveries
              </Link>
              <ActionForm action={setSupplierActive.bind(null, s.id, !s.is_active)}>
                <button type="submit" className={styles.secondary}>
                  {s.is_active ? 'Hide from menu' : 'Show in menu'}
                </button>
              </ActionForm>
              {can(staff.role, 'suppliers.tax') && s.deliveries === 0 && (
                <ActionForm action={deleteSupplier.bind(null, s.id)} confirm={`Delete ${s.name}? This can’t be undone.`}>
                  <button type="submit" className={styles.secondary}>
                    Delete
                  </button>
                </ActionForm>
              )}
            </div>
            <details>
              <summary>Edit</summary>
              <div style={{ marginTop: 12 }}>
                <ActionForm action={saveSupplier.bind(null, s.id)}>
                  <SupplierFields supplier={s} money={money}>
                    <div className={styles.buttons}>
                      <button type="submit" className={styles.primary}>
                        Save changes
                      </button>
                    </div>
                  </SupplierFields>
                </ActionForm>
              </div>
            </details>
          </section>
        ))
      )}
    </>
  );
}
