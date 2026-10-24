import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, requireStaffPage } from '@/lib/admin/session';
import { productRowColumns, rowToPayload, type ProductRow } from '@/lib/admin/product-payload';
import { UUID_PATTERN } from '@/lib/orders';
import { photoUrl } from '@/lib/photos';
import { ActionForm } from '../../ActionForm';
import { Flash } from '../../Flash';
import { liftRecall, recallProduct } from '../actions';
import { productFormOptions } from '../data';
import { PhotoManager } from '../PhotoManager';
import { ProductForm } from '../ProductForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params, searchParams }: PageProps<'/admin/products/[id]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const query = await searchParams;

  const [{ data: row }, { data: problems }, options, { data: photos }] = await Promise.all([
    staff.supabase.from('products').select(productRowColumns).eq('id', id).maybeSingle(),
    staff.supabase.rpc('product_publish_problems', { p_product_id: id }),
    productFormOptions(staff.supabase),
    staff.supabase.from('product_images').select('id, path, alt').eq('product_id', id).order('sort_order').order('created_at'),
  ]);
  if (!row) notFound();
  const product = row as unknown as ProductRow & { recalled_at: string | null; recall_reason: string | null };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href="/admin/products">Products</Link> /
          </p>
          <h1>{product.name}</h1>
          <p className={styles.muted}>
            {product.is_published ? (
              <>
                On the store at <Link href={`/products/${product.slug}`}>/products/{product.slug}</Link>
              </>
            ) : (
              'Draft: not on the store'
            )}
          </p>
        </div>
        <Link href={`/admin/inventory/${product.id}`} className={styles.secondary}>
          Stock and batches
        </Link>
      </div>
      <Flash message={query.done} />
      {product.recalled_at && (
        <div className={styles.error} role="note">
          <strong>Recalled.</strong> {product.recall_reason}. It can’t be sold or published until an admin lifts the
          recall.
          {staff.role === 'admin' && (
            <ActionForm action={liftRecall.bind(null, product.id)} confirm="Lift the recall? Recalled batches stay off sale.">
              <button type="submit" className={styles.secondary}>Lift recall</button>
            </ActionForm>
          )}
        </div>
      )}
      <PhotoManager
        productId={product.id}
        photos={(photos ?? []).map((p) => ({ id: p.id, url: photoUrl(p.path), alt: p.alt ?? '' }))}
        canEdit={can(staff.role, 'catalogue.edit')}
      />
      <ProductForm
        {...options}
        product={rowToPayload(product)}
        problems={(problems ?? []).filter((p) => p !== 'recall lifted')}
        canEdit={can(staff.role, 'catalogue.edit')}
      />
      {can(staff.role, 'recall') && !product.recalled_at && (
        <section className={styles.panel}>
          <h2>Recall</h2>
          <p className={styles.muted}>
            Takes the product off the store at once, takes all its stock off sale, and flags open orders that contain it.
          </p>
          <ActionForm action={recallProduct.bind(null, product.id)} confirm="Recall this product? This takes all of its stock off sale.">
            <label className={styles.field}>
              <span>Reason</span>
              <input name="reason" required placeholder="e.g. FDA alert, supplier recall notice" />
            </label>
            <button type="submit" className={styles.danger}>Recall product</button>
          </ActionForm>
        </section>
      )}
    </>
  );
}
