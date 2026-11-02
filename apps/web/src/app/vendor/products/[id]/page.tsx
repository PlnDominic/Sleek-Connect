import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAgeBands, getCategories } from '@/lib/catalog';
import { photoUrl } from '@/lib/photos';
import { getProductSections, getVendorSections, getVendorSession, type VendorProduct } from '@/lib/vendor';
import { deleteProduct, setProductSection } from '../../actions';
import { PhotoManager } from '../../PhotoManager';
import { ProductForm } from '../../ProductForm';
import { VendorForm } from '../../VendorForm';
import styles from '../../vendor.module.css';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params, searchParams }: PageProps<'/vendor/products/[id]'>) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor) redirect('/vendor');
  const [{ data, error }, categories, ageBands, sections, productSections] = await Promise.all([
    session.supabase.rpc('vendor_my_products'),
    getCategories(),
    getAgeBands(),
    getVendorSections(session, session.vendor.id),
    getProductSections(session),
  ]);
  if (error) throw error;
  const product = (data as unknown as VendorProduct[]).find((p) => p.id === id);
  if (!product) notFound();
  const currentSection = productSections.get(product.id) ?? '';

  return (
    <>
      <Link href="/vendor" className={styles.back}>
        ← Back to your store
      </Link>
      <h1 className={styles.title}>{product.name}</h1>
      {created && <p className={styles.success}>Product added. Add photos below and set your stock on the store page, then wait for our approval.</p>}
      {product.review_status === 'pending' && <p className={styles.notice}>Waiting for approval. We will set the shopper price and put it on sale.</p>}
      {product.review_status === 'rejected' && <p className={styles.warn}>Not approved{product.review_note ? `: ${product.review_note}` : '.'} Fix it and save to ask again.</p>}
      {product.problems.length > 0 && <p className={styles.warn}>Before this can go on sale it still needs: {product.problems.join(', ')}.</p>}
      <PhotoManager productId={product.id} photos={product.images.map((i) => ({ id: i.id, url: photoUrl(i.path) }))} />
      <ProductForm product={product} categories={categories} ageBands={ageBands} />
      {sections.length > 0 && (
        <section className={styles.panel}>
          <h2>Store section</h2>
          <VendorForm action={setProductSection.bind(null, product.id)}>
            <label className={styles.field}>
              <span>Show this product in</span>
              <select name="section_id" defaultValue={currentSection}>
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.buttons}>
              <button type="submit" className={styles.secondary}>
                Save section
              </button>
            </div>
          </VendorForm>
        </section>
      )}
      <section className={styles.panel}>
        <h2>Remove this product</h2>
        <p className={styles.muted}>Products with past orders are taken off sale and kept for the records.</p>
        <VendorForm action={deleteProduct.bind(null, product.id)} confirm="Remove this product from your store?">
          <button type="submit" className={styles.danger}>
            Remove product
          </button>
        </VendorForm>
      </section>
    </>
  );
}
