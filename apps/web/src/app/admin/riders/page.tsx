import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { saveRider } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Riders' };

export default async function RidersPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { data: riders, error } = await staff.supabase.from('riders').select('id, name, phone, vehicle, is_active').order('name');
  if (error) throw error;
  const edit = can(staff.role, 'riders.edit');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Riders</h1>
          <p className={styles.muted}>Customers see the rider’s name and vehicle.</p>
        </div>
      </div>
      {edit && (
        <section className={styles.panel}>
          <h2>Add a rider</h2>
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
      <section className={styles.panel}>
        {riders.length === 0 && <p className={styles.empty}>No riders yet.</p>}
        {riders.map((r) =>
          edit ? (
            <ActionForm key={r.id} action={saveRider.bind(null, r.id)}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Name</span>
                  <input name="name" required defaultValue={r.name} />
                </label>
                <label className={styles.field}>
                  <span>Phone</span>
                  <input name="phone" type="tel" required defaultValue={r.phone} />
                </label>
                <label className={styles.field}>
                  <span>Vehicle</span>
                  <input name="vehicle" defaultValue={r.vehicle} />
                </label>
                <label className={styles.check}>
                  <input type="checkbox" name="active" defaultChecked={r.is_active} />
                  Active
                </label>
                <button type="submit" className={styles.secondary}>Save</button>
              </div>
            </ActionForm>
          ) : (
            <p key={r.id}>
              {r.name} · {r.phone} · {r.vehicle} {!r.is_active && <span className={styles.badge}>inactive</span>}
            </p>
          ),
        )}
      </section>
    </>
  );
}
