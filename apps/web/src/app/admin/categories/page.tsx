import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { departmentLabels } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { deleteCategory, moveCategory } from './actions';
import { CategoryForm } from './CategoryForms';
import { CategoryPhotoButton } from './CategoryPhoto';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage({ searchParams }: PageProps<'/admin/categories'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const [{ data, error }, { data: used }] = await Promise.all([
    staff.supabase.from('categories').select('id, name, department, photo_path').order('sort_order').order('name'),
    staff.supabase.from('products').select('category_id'),
  ]);
  const productCounts = new Map<string, number>();
  for (const p of used ?? []) if (p.category_id) productCounts.set(p.category_id, (productCounts.get(p.category_id) ?? 0) + 1);
  const edit = can(staff.role, 'content.edit') || staff.role === 'catalogue' || staff.role === 'admin';
  if (error) return <p className={styles.notice}>Category photos aren’t available yet. The latest database update hasn’t been applied.</p>;
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;
  const categories = data ?? [];
  const { edit: editParam, new: newParam } = await searchParams;
  const adding = edit && newParam !== undefined;
  const editing = edit && typeof editParam === 'string' ? categories.find((c) => c.id === editParam) : undefined;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Categories</h1>
          <p className={styles.muted}>The picture shoppers see for each category on the home page and in the app. Wide or square photos work best. JPEG, PNG or WebP under 5 MB.</p>
        </div>
        {edit && (
          <Link href="/admin/categories?new=1" className={styles.primary}>
            Add category
          </Link>
        )}
      </div>

      {adding && (
        <section className={styles.panel} aria-labelledby="new-title">
          <div className={styles.panelHead}>
            <h2 id="new-title">Add category</h2>
            <Link href="/admin/categories" className={styles.secondary}>
              Close
            </Link>
          </div>
          <CategoryForm />
        </section>
      )}

      {editing && (
        <section className={styles.panel} aria-labelledby="edit-title">
          <div className={styles.panelHead}>
            <h2 id="edit-title">Edit {editing.name}</h2>
            <Link href="/admin/categories" className={styles.secondary}>
              Close
            </Link>
          </div>
          <CategoryForm category={editing} />
        </section>
      )}

      <section className={styles.panel} aria-label="Categories">
        {categories.length === 0 ? (
          <p className={styles.empty}>No categories yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Category</th>
                  <th>Department</th>
                  <th className={styles.num}>Products</th>
                  {edit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i, all) => {
                  const count = productCounts.get(c.id) ?? 0;
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.photo_path ? (
                          <Image src={`${base}/${c.photo_path}`} alt="" width={72} height={54} style={{ objectFit: 'cover', borderRadius: 8 }} />
                        ) : (
                          <div aria-hidden="true" style={{ width: 72, height: 54, borderRadius: 8, background: 'rgb(11 31 58 / 0.06)' }} />
                        )}
                      </td>
                      <td>
                        <strong>{c.name}</strong>
                        {!c.photo_path && <div className={styles.muted}>No photo: shoppers see a plain coloured tile.</div>}
                      </td>
                      <td>{departmentLabels[c.department as keyof typeof departmentLabels] ?? c.department}</td>
                      <td className={styles.num}>{count}</td>
                      {edit && (
                        <td>
                          <div className={styles.rowActions}>
                            <CategoryPhotoButton id={c.id} name={c.name} hasPhoto={Boolean(c.photo_path)} path={c.photo_path} />
                            <Link href={`/admin/categories?edit=${c.id}`} className={styles.iconButton} title="Edit" aria-label={`Edit ${c.name}`}>
                              <Icon name="pencil" size={16} />
                            </Link>
                            {i > 0 && (
                              <ActionForm action={moveCategory.bind(null, c.id, -1)}>
                                <button type="submit" className={styles.iconButton} title="Move earlier" aria-label={`Move ${c.name} earlier`}>↑</button>
                              </ActionForm>
                            )}
                            {i < all.length - 1 && (
                              <ActionForm action={moveCategory.bind(null, c.id, 1)}>
                                <button type="submit" className={styles.iconButton} title="Move later" aria-label={`Move ${c.name} later`}>↓</button>
                              </ActionForm>
                            )}
                            <ActionForm action={deleteCategory.bind(null, c.id)} confirm={`Delete ${c.name}? This can’t be undone.`}>
                              <button
                                type="submit"
                                className={`${styles.iconButton} ${styles.iconDanger}`}
                                title={count > 0 ? `${count} products are in this category` : 'Delete'}
                                aria-label={`Delete ${c.name}`}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </ActionForm>
                          </div>
                        </td>
                      )}
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
