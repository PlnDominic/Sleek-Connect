import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import Image from 'next/image';
import { can, requireStaffPage } from '@/lib/admin/session';
import { photoUrl } from '@/lib/photos';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Products' };

const filters = { all: 'All', live: 'On the store', draft: 'Drafts', incomplete: 'Missing details', recalled: 'Recalled' } as const;
type Filter = keyof typeof filters;

const PAGE_SIZE = 25;
const sorts = { name: 'Product', category: 'Category', price: 'Price', available: 'Available', status: 'Status' } as const;
type Sort = keyof typeof sorts;

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

  const sort: Sort = typeof params.sort === 'string' && params.sort in sorts ? (params.sort as Sort) : 'name';
  const dir = params.dir === 'desc' ? 'desc' : 'asc';
  const statusRank = (p: (typeof products)[number]) => (p.recalled_at ? 0 : p.is_published ? 2 : 1);
  const key = (p: (typeof products)[number]): string | number =>
    sort === 'price' ? p.price_ghs : sort === 'available' ? p.available : sort === 'status' ? statusRank(p) : sort === 'category' ? (p.category_name ?? '') : p.name.toLowerCase();
  products.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return dir === 'desc' ? -cmp : cmp;
  });

  const pages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.page) || 1));
  const shown = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // The main photo of each product on this page.
  const { data: photoRows } = shown.length
    ? await staff.supabase.from('product_images').select('product_id, path, sort_order').in('product_id', shown.map((p) => p.id)).order('sort_order')
    : { data: [] };
  const mainPhoto = new Map<string, string>();
  for (const r of photoRows ?? []) if (!mainPhoto.has(r.product_id)) mainPhoto.set(r.product_id, r.path);

  const link = (over: Record<string, string | number>) => {
    const next = new URLSearchParams({ show: filter, ...(q && { q }), sort, dir, page: String(page), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    return `/admin/products?${next}`;
  };
  const header = (id: Sort, className?: string) => (
    <th scope="col" className={className} aria-sort={sort === id ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={link({ sort: id, dir: sort === id && dir === 'asc' ? 'desc' : 'asc', page: 1 })} className={styles.sortLink}>
        {sorts[id]}
        <span aria-hidden="true">{sort === id ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
      </Link>
    </th>
  );

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Products</h1>
          <p className={styles.muted}>{products.length === data.length ? `${data.length} products` : `${products.length} of ${data.length} products`}. Only complete products can go on the store.</p>
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
                {header('name')}
                {header('category')}
                {header('price', styles.num)}
                {header('available', styles.num)}
                {header('status')}
                <th scope="col">Missing for publishing</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className={styles.productCell}>
                      {mainPhoto.has(p.id) ? (
                        <Image src={photoUrl(mainPhoto.get(p.id)!)} alt="" width={44} height={44} className={styles.thumb} />
                      ) : (
                        <span className={styles.thumbEmpty} aria-hidden="true" />
                      )}
                      <div>
                        <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
                        <div className={styles.muted}>{p.brand ?? 'No brand'}</div>
                      </div>
                    </div>
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
        {pages > 1 && (
          <nav className={styles.pager} aria-label="Pages">
            {page > 1 ? <Link href={link({ page: page - 1 })}>← Previous</Link> : <span />}
            <span className={styles.muted}>
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={link({ page: page + 1 })}>Next →</Link> : <span />}
          </nav>
        )}
      </section>
    </>
  );
}
