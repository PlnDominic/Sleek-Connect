import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { requireStaffPage, roleLabels, type StaffRole } from '@/lib/admin/session';
import { formatDate } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { setStaff, setStaffActive } from './actions';
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

export default async function StaffPage({ searchParams }: PageProps<'/admin/staff'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (staff.role !== 'admin') return <p className={styles.muted}>Only admins can manage staff.</p>;
  const { data: members, error } = await staff.supabase.from('staff_members').select('email, role, is_active, added_at').order('email');
  if (error) throw error;
  const { edit: editParam, new: newParam } = await searchParams;
  const adding = newParam !== undefined;
  const editing = typeof editParam === 'string' ? members.find((m) => m.email === editParam) : undefined;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Staff</h1>
          <p className={styles.muted}>They sign in at /admin with the email you add. Only add people you trust.</p>
        </div>
        <Link href="/admin/staff?new=1" className={styles.primary}>
          Add staff
        </Link>
      </div>

      {adding && (
        <section className={styles.panel} aria-labelledby="new-title">
          <div className={styles.panelHead}>
            <h2 id="new-title">Add staff</h2>
            <Link href="/admin/staff" className={styles.secondary}>
              Close
            </Link>
          </div>
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
      )}

      {editing && (
        <section className={styles.panel} aria-labelledby="edit-title">
          <div className={styles.panelHead}>
            <h2 id="edit-title">Edit {editing.email}</h2>
            <Link href="/admin/staff" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={setStaff.bind(null, editing.email)}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Role</span>
                <RoleSelect value={editing.role} />
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

      <section className={styles.panel} aria-label="Team">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email}>
                  <td><strong>{m.email}</strong></td>
                  <td>
                    {roleLabels[m.role]}
                    <div className={styles.muted}>{roleHelp[m.role]}</div>
                  </td>
                  <td className={styles.muted}>{formatDate(m.added_at)}</td>
                  <td>
                    <span className={styles.badge} data-tone={m.is_active ? 'good' : undefined}>{m.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <Link href={`/admin/staff?edit=${encodeURIComponent(m.email)}`} className={styles.iconButton} title="Edit" aria-label={`Edit ${m.email}`}>
                        <Icon name="pencil" size={16} />
                      </Link>
                      <ActionForm action={setStaffActive.bind(null, m.email, m.role, !m.is_active)}>
                        <button
                          type="submit"
                          className={styles.iconButton}
                          title={m.is_active ? 'Turn off sign-in' : 'Turn on sign-in'}
                          aria-label={m.is_active ? `Turn off sign-in for ${m.email}` : `Turn on sign-in for ${m.email}`}
                        >
                          <Icon name={m.is_active ? 'eyeOff' : 'eye'} size={16} />
                        </button>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
