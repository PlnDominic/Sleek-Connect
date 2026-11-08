import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { Icon } from '@/components/Icon';
import { ActionForm } from '../ActionForm';
import { deleteSupplier, saveSupplier, setSupplierActive } from './actions';
import { SupplierFields, type Supplier } from './SupplierFields';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage({ searchParams }: PageProps<'/admin/suppliers'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'suppliers.manage')) {
    return <p className={styles.notice}>Only operations, finance and admin staff can see suppliers.</p>;
  }
  const { edit: editParam, new: newParam } = await searchParams;
  const editId = typeof editParam === 'string' ? editParam : null;
  const adding = newParam !== undefined;
  const money = can(staff.role, 'suppliers.tax');
  const showOwed = can(staff.role, 'profit.view');
  const [{ data, error }, { data: balanceRows }] = await Promise.all([
    staff.supabase.rpc('admin_list_suppliers'),
    showOwed ? staff.supabase.rpc('admin_supplier_balances') : Promise.resolve({ data: null }),
  ]);
  const owed = new Map(((balanceRows ?? []) as unknown as { supplier_id: string; owed_ghs: number }[]).map((b) => [b.supplier_id, Number(b.owed_ghs)]));
  if (error) return <p className={styles.notice}>Suppliers aren’t available yet. The latest database update hasn’t been applied.</p>;
  const suppliers = (data as unknown as Supplier[]) ?? [];
  const editing = editId ? suppliers.find((s) => s.id === editId) : undefined;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Suppliers</h1>
          <p className={styles.muted}>Who we buy from. Pick the supplier when you receive stock under Inventory, and each delivery is kept here with its cost.</p>
        </div>
        <Link href="/admin/suppliers?new=1" className={styles.primary}>
          Add supplier
        </Link>
      </div>

      {adding && (
        <section className={styles.panel} aria-labelledby="new-title">
          <div className={styles.panelHead}>
            <h2 id="new-title">Add a supplier</h2>
            <Link href="/admin/suppliers" className={styles.secondary}>
              Close
            </Link>
          </div>
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
      )}

      {editing && (
        <section className={styles.panel} aria-labelledby="edit-title">
          <div className={styles.panelHead}>
            <h2 id="edit-title">Edit {editing.name}</h2>
            <Link href="/admin/suppliers" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={saveSupplier.bind(null, editing.id)}>
            <SupplierFields supplier={editing} money={money}>
              <div className={styles.buttons}>
                <button type="submit" className={styles.primary}>
                  Save changes
                </button>
              </div>
            </SupplierFields>
          </ActionForm>
        </section>
      )}

      <section className={styles.panel} aria-label="Suppliers">
        {suppliers.length === 0 ? (
          <p className={styles.empty}>No suppliers yet. Use Add supplier to create the first one.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th className={styles.num}>Deliveries</th>
                  <th className={styles.num}>Units</th>
                  <th className={styles.num}>Cost</th>
                  {showOwed && <th className={styles.num}>We owe</th>}
                  <th>Last delivery</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const owing = owed.get(s.id) ?? 0;
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/admin/suppliers/${s.id}`}>
                          <strong>{s.name}</strong>
                        </Link>
                        <div className={styles.muted}>
                          {s.products} {s.products === 1 ? 'product' : 'products'}
                        </div>
                      </td>
                      <td>
                        {s.contact_name && <div>{s.contact_name}</div>}
                        <div className={styles.muted}>{[s.phone, s.email].filter(Boolean).join(' · ') || (s.contact_name ? '' : '–')}</div>
                      </td>
                      <td className={styles.num}>{s.deliveries}</td>
                      <td className={styles.num}>{s.units_received}</td>
                      <td className={styles.num}>{formatPrice(Number(s.total_cost_ghs))}</td>
                      {showOwed && <td className={styles.num}>{owing > 0 ? <strong>{formatPrice(owing)}</strong> : '–'}</td>}
                      <td className={styles.muted}>{s.last_delivery ? formatDateTime(s.last_delivery) : '–'}</td>
                      <td>
                        <span className={styles.badge} data-tone={s.is_active ? 'good' : undefined}>
                          {s.is_active ? 'Active' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <Link href={`/admin/suppliers/${s.id}`} className={styles.iconButton} title="Deliveries" aria-label={`Deliveries from ${s.name}`}>
                            <Icon name="truck" size={16} />
                          </Link>
                          <Link href={`/admin/suppliers?edit=${s.id}`} className={styles.iconButton} title="Edit" aria-label={`Edit ${s.name}`} scroll>
                            <Icon name="pencil" size={16} />
                          </Link>
                          <ActionForm action={setSupplierActive.bind(null, s.id, !s.is_active)}>
                            <button
                              type="submit"
                              className={styles.iconButton}
                              title={s.is_active ? 'Hide from the receiving menu' : 'Show in the receiving menu'}
                              aria-label={s.is_active ? `Hide ${s.name} from the receiving menu` : `Show ${s.name} in the receiving menu`}
                            >
                              <Icon name={s.is_active ? 'eyeOff' : 'eye'} size={16} />
                            </button>
                          </ActionForm>
                          {money && s.deliveries === 0 && (
                            <ActionForm action={deleteSupplier.bind(null, s.id)} confirm={`Delete ${s.name}? This can’t be undone.`}>
                              <button type="submit" className={`${styles.iconButton} ${styles.iconDanger}`} title="Delete" aria-label={`Delete ${s.name}`}>
                                <Icon name="trash" size={16} />
                              </button>
                            </ActionForm>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
