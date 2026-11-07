'use client';

import { useState } from 'react';
import { departmentIds, departmentLabels } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { ActionForm } from '../ActionForm';
import { deleteCategory, moveCategory, saveCategory } from './actions';
import styles from '../admin.module.css';

function CategoryFields({ id, name, department }: { id?: string; name?: string; department?: string }) {
  return (
    <>
      {id && <input type="hidden" name="id" value={id} />}
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Name</span>
          <input name="name" required maxLength={60} defaultValue={name} placeholder="e.g. Nail Care" />
        </label>
        <label className={styles.field}>
          <span>Department</span>
          <select name="department" defaultValue={department ?? 'beauty'}>
            {departmentIds.map((d) => (
              <option key={d} value={d}>{departmentLabels[d]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>{id ? 'Save changes' : 'Add category'}</button>
      </div>
    </>
  );
}

/** The "Add category" button in the page header; opens a small form under it. */
export function AddCategory() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className={styles.primary} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={16} /> Add category
      </button>
      {open && (
        <section className={styles.panel} aria-label="Add category">
          <ActionForm action={saveCategory} resetOnSuccess>
            <CategoryFields />
          </ActionForm>
        </section>
      )}
    </div>
  );
}

/** Edit, reorder and delete buttons for one category. */
export function CategoryActions({ id, name, department, first, last, productCount }: { id: string; name: string; department: string; first: boolean; last: boolean; productCount: number }) {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ display: 'contents' }}>
      <div style={{ display: 'contents' }}>
        <button type="button" className={styles.iconButton} title="Edit" aria-label={`Edit ${name}`} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          <Icon name="pencil" size={16} />
        </button>
        {!first && (
          <ActionForm action={moveCategory.bind(null, id, -1)}>
            <button type="submit" className={styles.iconButton} title="Move earlier" aria-label={`Move ${name} earlier`}>↑</button>
          </ActionForm>
        )}
        {!last && (
          <ActionForm action={moveCategory.bind(null, id, 1)}>
            <button type="submit" className={styles.iconButton} title="Move later" aria-label={`Move ${name} later`}>↓</button>
          </ActionForm>
        )}
        <ActionForm action={deleteCategory.bind(null, id)} confirm={`Delete ${name}? This can’t be undone.`}>
          <button
            type="submit"
            className={`${styles.iconButton} ${styles.iconDanger}`}
            title={productCount > 0 ? `${productCount} products are in this category` : 'Delete'}
            aria-label={`Delete ${name}`}
          >
            <Icon name="trash" size={16} />
          </button>
        </ActionForm>
      </div>
      {editing && (
        <div style={{ flexBasis: '100%' }}>
          <ActionForm action={saveCategory}>
            <CategoryFields id={id} name={name} department={department} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
