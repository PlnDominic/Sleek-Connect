import type { Metadata } from 'next';
import Link from 'next/link';
import { getAgeBands, getCategories } from '@/lib/catalog';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ProductForm } from '../../../../../vendor/ProductForm';
import { saveSupplierProduct } from '../../../actions';
import styles from '../../../../admin.module.css';

export const metadata: Metadata = { title: 'Add a supplier product' };

export default async function NewSupplierProductPage({ params }: PageProps<'/admin/suppliers/[id]/products/new'>) {
  const { id } = await params;
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'catalogue.edit')) return <p className={styles.notice}>Only catalogue staff can add products.</p>;
  const [categories, ageBands] = await Promise.all([getCategories(), getAgeBands()]);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href={`/admin/suppliers/${id}`}>← Back to the supplier</Link>
          </p>
          <h1>Add a supplier product</h1>
          <p className={styles.muted}>Enter the supplier’s price. You set your markup when you approve it, and you can add photos right after you save.</p>
        </div>
      </div>
      <ProductForm categories={categories} ageBands={ageBands} action={saveSupplierProduct.bind(null, id, null)} />
    </>
  );
}
