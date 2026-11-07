import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../../ActionForm';
import { deleteSizeGuide, saveSizeGuide } from '../actions';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Size guides' };

/** The editor's text for a table: headings on the first line, then a line per row, cells split by "|". */
const tableText = (columns: string[], rows: unknown) =>
  [columns, ...((rows as string[][] | null) ?? [])].map((row) => row.join(' | ')).join('\n');

const placeholder = 'Size | Bust (cm) | Waist (cm)\nS | 84–88 | 66–70\nM | 88–92 | 70–74';

export default async function SizeGuidesPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const edit = can(staff.role, 'catalogue.edit');
  const [{ data: guides, error }, { data: used }] = await Promise.all([
    staff.supabase.from('size_guides').select('id, title, intro, columns, rows').order('title'),
    staff.supabase.from('products').select('size_guide_id').not('size_guide_id', 'is', null),
  ]);
  if (error) throw error;
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
      </div>

      {(guides ?? []).map((g) => (
        <section key={g.id} className={styles.panel}>
          <details>
            <summary>
              <strong>{g.title}</strong> <span className={styles.muted}>· used by {uses.get(g.id) ?? 0} product{uses.get(g.id) === 1 ? '' : 's'}</span>
            </summary>
            {edit ? (
              <>
                <ActionForm action={saveSizeGuide}>
                  <input type="hidden" name="id" value={g.id} />
                  <label className={styles.field}>
                    <span>Title</span>
                    <input name="title" required maxLength={80} defaultValue={g.title} />
                  </label>
                  <label className={styles.field}>
                    <span>How to measure (optional)</span>
                    <textarea name="intro" rows={3} maxLength={1000} defaultValue={g.intro ?? ''} />
                  </label>
                  <label className={styles.field}>
                    <span>Table</span>
                    <textarea name="table" rows={8} required defaultValue={tableText(g.columns, g.rows)} />
                    <small>First line: the column headings. Then one line per size. Separate cells with “|”.</small>
                  </label>
                  <button type="submit" className={styles.primary}>Save</button>
                </ActionForm>
                <ActionForm action={deleteSizeGuide.bind(null, g.id)} confirm="Delete this size guide? Products using it will have none.">
                  <button type="submit" className={styles.danger}>Delete this guide</button>
                </ActionForm>
              </>
            ) : (
              <pre className={styles.muted}>{tableText(g.columns, g.rows)}</pre>
            )}
          </details>
        </section>
      ))}

      {edit && (
        <section className={styles.panel}>
          <h2>New size guide</h2>
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
    </>
  );
}
