import type { Metadata } from 'next';
import { requireStaffPage, roleLabels, type StaffRole } from '@/lib/admin/session';
import { formatDate } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { setStaff } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Staff' };

const roleHelp: Record<StaffRole, string> = {
  admin: 'Everything, including staff and lifting recalls',
  catalogue: 'Products, publishing and recalls',
  operations: 'Stock, packing, riders and deliveries',
  support: 'View everything; cancel orders and resolve reviews',
  finance: 'View everything; record refunds',
  read_only: 'View only',
};

function RoleSelect({ value }: { value?: StaffRole }) {
  return (
    <select name="role" defaultValue={value ?? 'operations'}>
      {(Object.keys(roleLabels) as StaffRole[]).map((r) => (
        <option key={r} value={r}>
          {roleLabels[r]}: {roleHelp[r]}
        </option>
      ))}
    </select>
  );
}

export default async function StaffPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (staff.role !== 'admin') return <p className={styles.muted}>Only admins can manage staff.</p>;
  const { data: members, error } = await staff.supabase.from('staff_members').select('email, role, is_active, added_at').order('email');
  if (error) throw error;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Staff</h1>
          <p className={styles.muted}>They sign in at /admin with the email you add. Only add people you trust.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <h2>Add staff</h2>
        <ActionForm action={setStaff.bind(null, null)} resetOnSuccess>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Staff email</span>
              <input name="email" type="email" required />
            </label>
            <label className={styles.field}>
              <span>Role</span>
              <RoleSelect />
            </label>
          </div>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>Add</button>
          </div>
        </ActionForm>
      </section>
      <section className={styles.panel}>
        <h2>Team</h2>
        {members.map((m) => (
          <ActionForm key={m.email} action={setStaff.bind(null, m.email)}>
            <div className={styles.row}>
              <div className={styles.field}>
                <span>{m.email}</span>
                <small>Added {formatDate(m.added_at)}</small>
              </div>
              <label className={styles.field}>
                <span>Role</span>
                <RoleSelect value={m.role} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" name="active" defaultChecked={m.is_active} />
                Active
              </label>
              <button type="submit" className={styles.secondary}>Save</button>
            </div>
          </ActionForm>
        ))}
      </section>
    </>
  );
}
