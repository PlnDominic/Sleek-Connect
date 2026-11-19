import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { saveRider, setRiderActive } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Riders' };

export default async function RidersPage({ searchParams }: PageProps<'/admin/riders'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { data: riders, error } = await staff.supabase.from('riders').select('id, name, phone, vehicle, is_active').order('name');
  if (error) throw error;
  const edit = can(staff.role, 'riders.edit');
  const { edit: editParam, new: newParam } = await searchParams;
  const adding = edit && newParam !== undefined;
  const editing = edit && typeof editParam === 'string' ? riders.find((r) => r.id === editParam) : undefined;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Riders</h1>
          <p className={styles.muted}>Customers see the rider’s name and vehicle.</p>
        </div>
        {edit && (
          <Link href="/admin/riders?new=1" className={styles.primary}>
            Add rider
          </Link>
        )}
      </div>

      {adding && (
        <section className={styles.panel} aria-labelledby="new-title">
          <div className={styles.panelHead}>
            <h2 id="new-title">Add a rider</h2>
            <Link href="/admin/riders" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={saveRider.bind(null, null)} resetOnSuccess>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Name</span>
                <input name="name" required />
              </label>
              <label className={styles.field}>
                <span>Phone</span>
                <input name="phone" type="tel" required />
              </label>
              <label className={styles.field}>
                <span>Vehicle</span>
                <input name="vehicle" defaultValue="Motorbike" />
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>Add rider</button>
            </div>
          </ActionForm>
        </section>
      )}

      {editing && (
        <section className={styles.panel} aria-labelledby="edit-title">
          <div className={styles.panelHead}>
            <h2 id="edit-title">Edit {editing.name}</h2>
            <Link href="/admin/riders" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={saveRider.bind(null, editing.id)}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Name</span>
                <input name="name" required defaultValue={editing.name} />
              </label>
              <label className={styles.field}>
                <span>Phone</span>
                <input name="phone" type="tel" required defaultValue={editing.phone} />
              </label>
              <label className={styles.field}>
                <span>Vehicle</span>
                <input name="vehicle" defaultValue={editing.vehicle} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" name="active" defaultChecked={editing.is_active} />
                Active
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>Save changes</button>
            </div>
          </ActionForm>
        </section>
      )}

      <section className={styles.panel} aria-label="Riders">
        {riders.length === 0 ? (
          <p className={styles.empty}>No riders yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  {edit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.phone}</td>
                    <td>{r.vehicle}</td>
                    <td>
                      <span className={styles.badge} data-tone={r.is_active ? 'good' : undefined}>{r.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    {edit && (
                      <td>
                        <div className={styles.rowActions}>
                          <Link href={`/admin/riders?edit=${r.id}`} className={styles.iconButton} title="Edit" aria-label={`Edit ${r.name}`}>
                            <Icon name="pencil" size={16} />
                          </Link>
                          <ActionForm action={setRiderActive.bind(null, { id: r.id, name: r.name, phone: r.phone, vehicle: r.vehicle }, !r.is_active)}>
                            <button
                              type="submit"
                              className={styles.iconButton}
                              title={r.is_active ? 'Make inactive' : 'Make active'}
                              aria-label={r.is_active ? `Make ${r.name} inactive` : `Make ${r.name} active`}
                            >
                              <Icon name={r.is_active ? 'eyeOff' : 'eye'} size={16} />
                            </button>
                          </ActionForm>
                        </div>
                      </td>
                    )}
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
