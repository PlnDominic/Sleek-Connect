import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDate } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { clearSearchMiss } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Searches' };

const ranges = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' } as const;

export default async function SearchesPage({ searchParams }: PageProps<'/admin/searches'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'content.edit')) return <p className={styles.notice}>Only catalogue staff and admins can see this report.</p>;
  const { days: raw } = await searchParams;
  const days = typeof raw === 'string' && raw in ranges ? raw : '30';
  const { data, error } = await staff.supabase.rpc('admin_search_misses', { p_days: Number(days) });
  if (error) return <p className={styles.notice}>This report isn’t available yet. The latest database update hasn’t been applied.</p>;
  const rows = data ?? [];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Searches</h1>
          <p className={styles.muted}>
            Words shoppers searched for on the website and found nothing, most often first. Only the words and a daily count are kept, never who
            searched. Add a product for the popular ones, then remove the word.
          </p>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="Period">
        {Object.entries(ranges).map(([value, label]) => (
          <Link key={value} href={`/admin/searches?days=${value}`} aria-current={value === days ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <section className={styles.panel} aria-label="Searches with no results">
        {rows.length === 0 ? (
          <p className={styles.empty}>No unsuccessful searches in this period.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Searched for</th>
                  <th className={styles.num}>Times</th>
                  <th className={styles.num}>Days</th>
                  <th>Last</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.term}>
                    <td>
                      <strong>{r.term}</strong>
                    </td>
                    <td className={styles.num}>{r.searches}</td>
                    <td className={styles.num}>{r.days_seen}</td>
                    <td>{formatDate(r.last_seen)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link href={`/search?q=${encodeURIComponent(r.term)}`} className={styles.iconButton} target="_blank" title="Search the store for this" aria-label={`Search the store for ${r.term}`}>
                          <Icon name="search" size={16} />
                        </Link>
                        {can(staff.role, 'catalogue.edit') && (
                          <Link href="/admin/products/new" className={styles.iconButton} title="Add a product" aria-label={`Add a product for ${r.term}`}>
                            <Icon name="plus" size={16} />
                          </Link>
                        )}
                        <ActionForm action={clearSearchMiss.bind(null, r.term)}>
                          <button type="submit" className={`${styles.iconButton} ${styles.iconDanger}`} title="Remove from the list" aria-label={`Remove ${r.term} from the list`}>
                            <Icon name="trash" size={16} />
                          </button>
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
