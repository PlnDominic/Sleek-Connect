import { departmentIds, departmentLabels } from '@sleek/shared';
import { ActionForm } from '../ActionForm';
import { saveCategory } from './actions';
import styles from '../admin.module.css';

/** The form for adding a category, or editing one when `category` is given. */
export function CategoryForm({ category }: { category?: { id: string; name: string; department: string } }) {
  return (
    <ActionForm action={saveCategory} resetOnSuccess={!category}>
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Name</span>
          <input name="name" required maxLength={60} defaultValue={category?.name} placeholder="e.g. Nail Care" />
        </label>
        <label className={styles.field}>
          <span>Department</span>
          <select name="department" defaultValue={category?.department ?? 'beauty'}>
            {departmentIds.map((d) => (
              <option key={d} value={d}>{departmentLabels[d]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>{category ? 'Save changes' : 'Add category'}</button>
      </div>
    </ActionForm>
  );
}
