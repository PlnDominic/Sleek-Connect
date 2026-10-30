import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { productFormOptions } from '../data';
import { ProductForm } from '../ProductForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Add product' };

export default async function NewProductPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const options = await productFormOptions(staff.supabase);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Add product</h1>
          <p className={styles.muted}>New products start as drafts. Add stock on the Inventory page once it’s saved.</p>
        </div>
      </div>
      <ProductForm {...options} problems={[]} canEdit={can(staff.role, 'catalogue.edit')} />
    </>
  );
}
