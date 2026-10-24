import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Products' };

const filters = { all: 'All', live: 'On the store', draft: 'Drafts', incomplete: 'Missing details', recalled: 'Recalled' } as const;
type Filter = keyof typeof filters;

export default async function ProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const filter: Filter = typeof params.show === 'string' && params.show in filters ? (params.show as Filter) : 'all';
  const q = typeof params.q === 'string' ? params.q.trim().toLowerCase() : '';

  const { data, error } = await staff.supabase.rpc('admin_products');
  if (error) throw error;
  const products = data.filter((p) => {
    if (q && !`${p.name} ${p.brand ?? ''} ${p.slug}`.toLowerCase().includes(q)) return false;
    if (filter === 'live') return p.is_published;
    if (filter === 'draft') return !p.is_published && !p.recalled_at;
    if (filter === 'incomplete') return p.problems.length > 0;
    if (filter === 'recalled') return Boolean(p.recalled_at);
    return true;
  });
  const edit = can(staff.role, 'catalogue.edit');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Products</h1>
          <p className={styles.muted}>{data.length} products. Only complete products can go on the store.</p>
        </div>
        {edit && (
          <div className={styles.buttons}>
            <Link href="/admin/products/import" className={styles.secondary}>Import CSV</Link>
            <Link href="/admin/products/new" className={styles.primary}>Add product</Link>
          </div>
        )}
      </div>
      <div className={styles.panelHead}>
        <nav className={styles.tabs} aria-label="Filter products">
          {(Object.keys(filters) as Filter[]).map((key) => (
            <Link key={key} href={`/admin/products?show=${key}`} aria-current={key === filter ? 'page' : undefined}>
              {filters[key]}
            </Link>
          ))}
        </nav>
        <form className={styles.search} role="search">
          <input type="hidden" name="show" value={filter} />
          <input name="q" type="search" defaultValue={q} placeholder="Name, brand or web address" aria-label="Search products" />
          <button type="submit" className={styles.secondary}>Search</button>
        </form>
      </div>
      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col" className={styles.num}>Price</th>
                <th scope="col" className={styles.num}>Available</th>
                <th scope="col">Status</th>
                <th scope="col">Missing for publishing</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
                    <div className={styles.muted}>{p.brand ?? 'No brand'}</div>
                  </td>
                  <td>{p.category_name ?? '–'}</td>
                  <td className={styles.num}>{formatPrice(p.price_ghs)}</td>
                  <td className={styles.num}>{p.available}</td>
                  <td>
                    {p.recalled_at ? (
                      <span className={styles.badge} data-tone="bad">Recalled</span>
                    ) : p.is_published ? (
                      <span className={styles.badge} data-tone="good">On the store</span>
                    ) : (
                      <span className={styles.badge}>Draft</span>
                    )}
                  </td>
                  <td className={styles.muted}>{p.problems.filter((x) => x !== 'recall lifted').join(', ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p className={styles.empty}>No products match.</p>}
        </div>
      </section>
    </>
  );
}
