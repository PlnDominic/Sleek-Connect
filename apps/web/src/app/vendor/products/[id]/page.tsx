import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAgeBands, getCategories } from '@/lib/catalog';
import { photoUrl } from '@/lib/photos';
import { getVendorSession, type VendorProduct } from '@/lib/vendor';
import { deleteProduct } from '../../actions';
import { PhotoManager } from '../../PhotoManager';
import { ProductForm } from '../../ProductForm';
import { VendorForm } from '../../VendorForm';
import styles from '../../vendor.module.css';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params, searchParams }: PageProps<'/vendor/products/[id]'>) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_my_products');
  if (error) throw error;
  const product = (data as unknown as VendorProduct[]).find((p) => p.id === id);
  if (!product) notFound();
  const [categories, ageBands] = await Promise.all([getCategories(), getAgeBands()]);

  return (
    <>
      <Link href="/vendor" className={styles.back}>
        ← Back to your store
      </Link>
      <h1>{product.name}</h1>
      {created && <p className={styles.success}>Product added. Add photos below and set your stock on the store page, then wait for our approval.</p>}
      {product.review_status === 'pending' && <p className={styles.notice}>Waiting for approval. We will set the shopper price and put it on sale.</p>}
      {product.review_status === 'rejected' && <p className={styles.warn}>Not approved{product.review_note ? `: ${product.review_note}` : '.'} Fix it and save to ask again.</p>}
      {product.problems.length > 0 && <p className={styles.warn}>Before this can go on sale it still needs: {product.problems.join(', ')}.</p>}
      <PhotoManager productId={product.id} photos={product.images.map((i) => ({ id: i.id, url: photoUrl(i.path) }))} />
      <ProductForm product={product} categories={categories} ageBands={ageBands} />
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
