import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE = 100;

/** Families of actions, by prefix (e.g. "product.price_changed"). */
const families = {
  '': 'Everything',
  product: 'Products',
  stock: 'Stock',
  batch: 'Batches',
  order: 'Orders',
  return: 'Returns',
  support: 'Support',
  banner: 'Banners',
  collection: 'Featured products',
  delivery: 'Delivery',
  rider: 'Riders',
  settings: 'Settings',
  staff: 'Staff',
} as const;

export default async function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'staff.manage')) return <p className={styles.notice}>Only admins can read the audit log.</p>;

  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string).trim() : '');
  const family = str('family') in families ? str('family') : '';
  const who = str('who').replace(/[%,()]/g, '');
  const before = /^\d+$/.test(str('before')) ? Number(str('before')) : null;

  let query = staff.supabase
    .from('audit_log')
    .select('id, at, actor_email, action, entity, entity_id, details')
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (family) query = query.like('action', `${family}.%`);
  if (who) query = query.ilike('actor_email', `%${who}%`);
  if (before) query = query.lt('id', before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data.slice(0, PAGE);
  const more = data.length > PAGE;
  const next = new URLSearchParams({ ...(family && { family }), ...(who && { who }), before: String(rows.at(-1)?.id ?? '') });

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Audit log</h1>
          <p className={styles.muted}>
            Every sensitive change, who made it and when (PRD FR-109). Entries can’t be edited or deleted, even by admins.
          </p>
        </div>
      </div>
      <div className={styles.panelHead}>
        <form className={styles.search} role="search">
          <select name="family" defaultValue={family} aria-label="What changed">
            {Object.entries(families).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="who" type="search" defaultValue={who} placeholder="Staff email" aria-label="Staff email" />
          <button type="submit" className={styles.secondary}>
            Filter
          </button>
        </form>
      </div>
      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.empty}>Nothing recorded{family || who ? ' for this filter' : ' yet'}.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Action</th>
                  <th scope="col">What</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.at)}</td>
                    <td>{r.actor_email ?? 'System'}</td>
                    <td>
                      <code>{r.action}</code>
                    </td>
                    <td>
                      {r.entity}
                      {r.entity_id && <span className={styles.muted}> · {r.entity_id}</span>}
                    </td>
                    <td>
                      {r.details && Object.keys(r.details).length > 0 ? (
                        <details>
                          <summary>Show</summary>
                          <pre className={styles.json}>{JSON.stringify(r.details, null, 2)}</pre>
                        </details>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more && (
          <div className={styles.buttons}>
            <Link href={`/admin/audit?${next}`} className={styles.secondary}>
              Older entries
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
