import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import type { VendorProduct } from '@/lib/vendor';
import { ActionForm } from '../../ActionForm';
import { setSupplierStock, updateSupplier } from '../actions';
import { SupplierFields, type Supplier } from '../SupplierFields';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Supplier' };

const reviewText = { draft: 'Removed', pending: 'Waiting for approval', approved: 'Approved', rejected: 'Not approved' } as const;

export default async function SupplierPage({ params }: PageProps<'/admin/suppliers/[id]'>) {
  const { id } = await params;
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'vendors.manage')) return <p className={styles.notice}>Only admins can manage suppliers.</p>;
  const [{ data: list, error }, { data: productData }] = await Promise.all([
    staff.supabase.rpc('admin_list_suppliers'),
    staff.supabase.rpc('admin_supplier_products', { p_vendor_id: id }),
  ]);
  if (error) throw error;
  const supplier = ((list as unknown as Supplier[]) ?? []).find((s) => s.id === id);
  if (!supplier) notFound();
  const products = (productData as unknown as VendorProduct[]) ?? [];
  const owed = Number(supplier.balance?.payable ?? 0);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href="/admin/suppliers">Suppliers</Link>
          </p>
          <h1>{supplier.name}</h1>
          <p className={styles.muted}>
            {supplier.products} {supplier.products === 1 ? 'product' : 'products'} · {supplier.on_sale} on sale · owed for delivered goods:{' '}
            <strong>{formatPrice(owed)}</strong> · <Link href="/admin/vendors?tab=payouts">Record a payment</Link> ·{' '}
            <Link href={`/store/${supplier.slug}`}>Shopper page</Link>
          </p>
        </div>
      </div>

      <section className={styles.panel} aria-labelledby="products-title">
        <div className={styles.panelHead}>
          <h2 id="products-title">Products</h2>
          <Link href={`/admin/suppliers/${id}/products/new`} className={styles.primary}>
            Add a product
          </Link>
        </div>
        {products.some((p) => p.review_status === 'pending') && (
          <p className={styles.notice}>
            Some products are waiting for approval. <Link href="/admin/vendors?tab=products">Set the markup and approve them</Link>. The shopper price is the supplier’s
            price plus your markup.
          </p>
        )}
        {products.length === 0 ? (
          <p className={styles.empty}>No products yet.</p>
        ) : (
          products.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid var(--c-line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                <strong>
                  <Link href={`/admin/suppliers/${id}/products/${p.id}`}>{p.name}</Link>
                </strong>
                <span className={styles.muted}>
                  {p.is_published ? 'On sale' : reviewText[p.review_status]} · supplier price {formatPrice(p.vendor_price_ghs)}
                  {p.shopper_price_ghs !== null ? ` · shoppers pay ${formatPrice(p.shopper_price_ghs)}` : ''}
                </span>
              </div>
              {p.problems.length > 0 && <p className={styles.muted}>Still needed: {p.problems.join(', ')}.</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {(p.sizes.length ? p.sizes : [{ code: '', label: 'Stock', stock: p.one_size_stock ?? 0 }]).map((s) => (
                  <ActionForm key={s.code} action={setSupplierStock.bind(null, id, p.id, s.code)}>
                    <label className={styles.field}>
                      <span>{s.label}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input name="quantity" type="number" min={0} step={1} defaultValue={s.stock} style={{ width: 90 }} aria-label={`Stock for ${p.name}, ${s.label}`} />
                        <button type="submit" className={styles.secondary}>
                          Save
                        </button>
                      </div>
                    </label>
                  </ActionForm>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className={styles.panel} aria-labelledby="details-title">
        <h2 id="details-title">Supplier details</h2>
        <ActionForm action={updateSupplier.bind(null, id)}>
          <SupplierFields supplier={supplier} />
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Save supplier
            </button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
