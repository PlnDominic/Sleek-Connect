import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, type OrderStatus } from '@/lib/orders';
import { StatusBadge } from '../StatusBadge';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Search' };

export default async function AdminSearchPage({ searchParams }: PageProps<'/admin/search'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { q: raw } = await searchParams;
  // Characters that mean something in a filter are dropped, not escaped.
  const q = (typeof raw === 'string' ? raw : '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 60);

  let orders: { order_number: string; customer_name: string; status: string; total_ghs: number | null; created_at: string }[] = [];
  let products: { id: string; name: string; brand: string; slug: string; is_published: boolean }[] = [];
  let vendors: { id: string; name: string; slug: string; status: string }[] = [];

  if (q.length >= 2) {
    const db = staff.supabase;
    const needle = q.toLowerCase();
    const [o, p, v] = await Promise.all([
      db
        .from('orders')
        .select('order_number, customer_name, status, total_ghs, created_at')
        .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(10),
      db.rpc('admin_products'),
      can(staff.role, 'vendors.manage') ? db.rpc('admin_vendors') : Promise.resolve({ data: [] }),
    ]);
    orders = o.data ?? [];
    products = (p.data ?? []).filter((x) => `${x.name} ${x.brand ?? ''} ${x.slug}`.toLowerCase().includes(needle)).slice(0, 10);
    vendors = ((v.data ?? []) as unknown as typeof vendors).filter((x) => `${x.name} ${x.slug}`.toLowerCase().includes(needle)).slice(0, 10);
  }
  const none = orders.length + products.length + vendors.length === 0;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Search</h1>
          <p className={styles.muted}>Find an order by number, customer name or phone, a product by name or brand, or a vendor.</p>
        </div>
      </div>
      <form className={styles.search} role="search">
        <input name="q" type="search" defaultValue={q} placeholder="Order number, customer, product or vendor" aria-label="Search the admin" autoFocus />
        <button type="submit" className={styles.primary}>
          Search
        </button>
      </form>
      {q.length > 0 && q.length < 2 && <p className={styles.muted}>Type at least two characters.</p>}
      {q.length >= 2 && none && <p className={styles.empty}>Nothing found for “{q}”.</p>}

      {orders.length > 0 && (
        <section className={styles.panel} aria-labelledby="s-orders">
          <h2 id="s-orders">Orders</h2>
          <table className={styles.table}>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_number}>
                  <td>
                    <Link href={`/admin/orders/${o.order_number}`}>{o.order_number}</Link>
                    <div className={styles.muted}>{formatDateTime(o.created_at)}</div>
                  </td>
                  <td>{o.customer_name}</td>
                  <td className={styles.num}>{o.total_ghs === null ? '–' : formatPrice(o.total_ghs)}</td>
                  <td>
                    <StatusBadge status={o.status as OrderStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {products.length > 0 && (
        <section className={styles.panel} aria-labelledby="s-products">
          <h2 id="s-products">Products</h2>
          <table className={styles.table}>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
                    <div className={styles.muted}>{p.brand ?? 'No brand'}</div>
                  </td>
                  <td>
                    <span className={styles.badge} data-tone={p.is_published ? 'good' : undefined}>
                      {p.is_published ? 'On the store' : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {vendors.length > 0 && (
        <section className={styles.panel} aria-labelledby="s-vendors">
          <h2 id="s-vendors">Vendors</h2>
          <table className={styles.table}>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href="/admin/vendors">{v.name}</Link>
                    <div className={styles.muted}>/store/{v.slug}</div>
                  </td>
                  <td>
                    <span className={styles.badge}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
