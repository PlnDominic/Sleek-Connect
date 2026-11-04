import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAgeBands, getCategories } from '@/lib/catalog';
import { can, requireStaffPage } from '@/lib/admin/session';
import { photoUrl } from '@/lib/photos';
import type { VendorProduct } from '@/lib/vendor';
import { PhotoManager } from '../../../../products/PhotoManager';
import { ProductForm } from '../../../../../vendor/ProductForm';
import { ActionForm } from '../../../../ActionForm';
import { deleteSupplierProduct, saveSupplierProduct } from '../../../actions';
import styles from '../../../../admin.module.css';

export const metadata: Metadata = { title: 'Supplier product' };

export default async function SupplierProductPage({ params, searchParams }: PageProps<'/admin/suppliers/[id]/products/[productId]'>) {
  const [{ id, productId }, { created }] = await Promise.all([params, searchParams]);
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'catalogue.edit')) return <p className={styles.notice}>Only catalogue staff can edit products.</p>;
  const [{ data, error }, categories, ageBands] = await Promise.all([
    staff.supabase.rpc('admin_supplier_products', { p_vendor_id: id }),
    getCategories(),
    getAgeBands(),
  ]);
  if (error) throw error;
  const product = ((data as unknown as VendorProduct[]) ?? []).find((p) => p.id === productId);
  if (!product) notFound();

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href={`/admin/suppliers/${id}`}>← Back to the supplier</Link>
          </p>
          <h1>{product.name}</h1>
        </div>
      </div>
      {created && <p className={styles.notice}>Product added. Add photos and stock, then approve it with its markup under Vendors → Products to review.</p>}
      {product.review_status === 'pending' && (
        <p className={styles.notice}>
          Waiting for approval. <Link href="/admin/vendors?tab=products">Set the markup and approve it</Link>.
        </p>
      )}
      {product.problems.length > 0 && <p className={styles.notice}>Before this can go on sale it still needs: {product.problems.join(', ')}.</p>}
      <PhotoManager productId={product.id} photos={product.images.map((i) => ({ id: i.id, url: photoUrl(i.path), alt: '' }))} canEdit />
      <ProductForm product={product} categories={categories} ageBands={ageBands} action={saveSupplierProduct.bind(null, id, product.id)} />
      <section className={styles.panel}>
        <h2>Remove this product</h2>
        <p className={styles.muted}>Products with past orders are taken off sale and kept for the records.</p>
        <ActionForm action={deleteSupplierProduct.bind(null, id, product.id)} confirm="Remove this product?">
          <button type="submit" className={styles.secondary}>
            Remove product
          </button>
        </ActionForm>
      </section>
    </>
  );
}
