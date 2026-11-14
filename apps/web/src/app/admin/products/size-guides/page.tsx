import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../../ActionForm';
import { deleteSizeGuide, saveSizeGuide } from '../actions';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Size guides' };

/** The editor's text for a table: headings on the first line, then a line per row, cells split by "|". */
const tableText = (columns: string[], rows: unknown) =>
  [columns, ...((rows as string[][] | null) ?? [])].map((row) => row.join(' | ')).join('\n');

const placeholder = 'Size | Bust (cm) | Waist (cm)\nS | 84–88 | 66–70\nM | 88–92 | 70–74';

export default async function SizeGuidesPage({ searchParams }: PageProps<'/admin/products/size-guides'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const edit = can(staff.role, 'catalogue.edit');
  const [{ data: guides, error }, { data: used }] = await Promise.all([
    staff.supabase.from('size_guides').select('id, title, intro, columns, rows').order('title'),
    staff.supabase.from('products').select('size_guide_id').not('size_guide_id', 'is', null),
  ]);
  if (error) throw error;
  const { edit: editParam, new: newParam } = await searchParams;
  const adding = edit && newParam !== undefined;
  const editing = edit && typeof editParam === 'string' ? (guides ?? []).find((g) => g.id === editParam) : undefined;
  const uses = new Map<string, number>();
  for (const row of used ?? []) if (row.size_guide_id) uses.set(row.size_guide_id, (uses.get(row.size_guide_id) ?? 0) + 1);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Size guides</h1>
          <p className={styles.muted}>
            Charts shoppers open from a product page. Give a product its guide on the product itself, or tick several on the{' '}
            <Link href="/admin/products">products page</Link> and choose “Set the size guide”. The starter charts are typical sizes:
            check them against your suppliers’ own.
          </p>
        </div>
        {edit && (
          <Link href="/admin/products/size-guides?new=1" className={styles.primary}>
            New size guide
          </Link>
        )}
      </div>

      {adding && (
        <section className={styles.panel} aria-labelledby="new-title">
          <div className={styles.panelHead}>
            <h2 id="new-title">New size guide</h2>
            <Link href="/admin/products/size-guides" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={saveSizeGuide} resetOnSuccess>
            <label className={styles.field}>
              <span>Title</span>
              <input name="title" required maxLength={80} placeholder="e.g. Men’s shirts" />
            </label>
            <label className={styles.field}>
              <span>How to measure (optional)</span>
              <textarea name="intro" rows={3} maxLength={1000} />
            </label>
            <label className={styles.field}>
              <span>Table</span>
              <textarea name="table" rows={8} required placeholder={placeholder} />
              <small>First line: the column headings. Then one line per size. Separate cells with “|”.</small>
            </label>
            <button type="submit" className={styles.primary}>Add size guide</button>
          </ActionForm>
        </section>
      )}

      {editing && (
        <section className={styles.panel} aria-labelledby="edit-title">
          <div className={styles.panelHead}>
            <h2 id="edit-title">Edit {editing.title}</h2>
            <Link href="/admin/products/size-guides" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={saveSizeGuide}>
            <input type="hidden" name="id" value={editing.id} />
            <label className={styles.field}>
              <span>Title</span>
              <input name="title" required maxLength={80} defaultValue={editing.title} />
            </label>
            <label className={styles.field}>
              <span>How to measure (optional)</span>
              <textarea name="intro" rows={3} maxLength={1000} defaultValue={editing.intro ?? ''} />
            </label>
            <label className={styles.field}>
              <span>Table</span>
              <textarea name="table" rows={8} required defaultValue={tableText(editing.columns, editing.rows)} />
              <small>First line: the column headings. Then one line per size. Separate cells with “|”.</small>
            </label>
            <button type="submit" className={styles.primary}>Save changes</button>
          </ActionForm>
        </section>
      )}

      <section className={styles.panel} aria-label="Size guides">
        {(guides ?? []).length === 0 ? (
          <p className={styles.empty}>No size guides yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Guide</th>
                  <th>Columns</th>
                  <th className={styles.num}>Sizes</th>
                  <th className={styles.num}>Used by</th>
                  {edit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {(guides ?? []).map((g) => {
                  const count = uses.get(g.id) ?? 0;
                  return (
                    <tr key={g.id}>
                      <td><strong>{g.title}</strong></td>
                      <td className={styles.muted}>{g.columns.join(' · ')}</td>
                      <td className={styles.num}>{((g.rows as unknown as string[][] | null) ?? []).length}</td>
                      <td className={styles.num}>{count} product{count === 1 ? '' : 's'}</td>
                      {edit && (
                        <td>
                          <div className={styles.rowActions}>
                            <Link href={`/admin/products/size-guides?edit=${g.id}`} className={styles.iconButton} title="Edit" aria-label={`Edit ${g.title}`}>
                              <Icon name="pencil" size={16} />
                            </Link>
                            <ActionForm action={deleteSizeGuide.bind(null, g.id)} confirm={`Delete ${g.title}? Products using it will have none.`}>
                              <button type="submit" className={`${styles.iconButton} ${styles.iconDanger}`} title="Delete" aria-label={`Delete ${g.title}`}>
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
