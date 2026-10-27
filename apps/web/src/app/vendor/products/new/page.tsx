import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAgeBands, getCategories } from '@/lib/catalog';
import { getVendorSession } from '@/lib/vendor';
import { ProductForm } from '../../ProductForm';
import styles from '../../vendor.module.css';

export const metadata: Metadata = { title: 'Add a product' };

export default async function NewProductPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const [categories, ageBands] = await Promise.all([getCategories(), getAgeBands()]);
  return (
    <>
      <Link href="/vendor" className={styles.back}>
        ← Back to your store
      </Link>
      <h1 className={styles.title}>Add a product</h1>
      <p className={styles.lead}>
        You can add photos and set your stock right after you save. Have a lot to add?{' '}
        <Link href="/vendor/products/import">Upload a spreadsheet</Link>.
      </p>
      <ProductForm categories={categories} ageBands={ageBands} />
    </>
  );
}
