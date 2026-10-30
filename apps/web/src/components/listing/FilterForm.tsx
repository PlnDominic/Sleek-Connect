'use client';

import Form from 'next/form';
import { useRef, type ReactNode } from 'react';
import styles from './listing.module.css';

/**
 * The filter sidebar. Any change re-runs the listing (client-side navigation, keeping the scroll position);
 * the Apply button covers browsers without JavaScript.
 */
export function FilterForm({ action, children, activeCount }: { action: string; children: ReactNode; activeCount: number }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Form
      id="filters"
      ref={ref}
      action={action}
      scroll={false}
      className={styles.filters}
      onChange={() => ref.current?.requestSubmit()}
    >
      <details className={styles.filterToggle} open>
        <summary>
          Filters{activeCount > 0 && <span className={styles.filterCount}>{activeCount}</span>}
        </summary>
        <div className={styles.filterBody}>
          {children}
          <noscript>
            <button type="submit" className={styles.apply}>
              Apply filters
            </button>
          </noscript>
        </div>
      </details>
    </Form>
  );
}

/** The sort menu sits in the toolbar but belongs to the filter form. */
export function SortSelect({ value, options }: { value: string; options: [string, string][] }) {
  return (
    <label className={styles.sort}>
      <span>Sort by</span>
      <select
        name="sort"
        form="filters"
        defaultValue={value}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()}
      >
        {options.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
