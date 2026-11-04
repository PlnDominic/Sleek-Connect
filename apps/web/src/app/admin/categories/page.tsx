import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { CategoryPhoto } from './CategoryPhoto';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { data, error } = await staff.supabase.from('categories').select('id, name, department, photo_path').order('sort_order');
  if (error) return <p className={styles.notice}>Category photos aren’t available yet. The latest database update hasn’t been applied.</p>;
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Categories</h1>
          <p className={styles.muted}>The picture shoppers see for each category on the home page and in the app. Wide or square photos work best. JPEG, PNG or WebP under 5 MB.</p>
        </div>
      </div>
      {(data ?? []).map((c) => (
        <CategoryPhoto key={c.id} id={c.id} name={c.name} url={c.photo_path ? `${base}/${c.photo_path}` : null} path={c.photo_path} canEdit={can(staff.role, 'content.edit') || staff.role === 'catalogue' || staff.role === 'admin'} />
      ))}
    </>
  );
}
