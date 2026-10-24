import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ImportForm } from './ImportForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Import products' };

export default async function ImportPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href="/admin/products">Products</Link> /
          </p>
          <h1>Import products</h1>
          <p className={styles.muted}>
            Add or update many products from a spreadsheet saved as CSV. Rows whose web address (slug) already exists
            update that product; empty cells keep its current value.
          </p>
        </div>
        <a href="/admin/products/template" className={styles.secondary} download>
          Download the template
        </a>
      </div>
      <section className={styles.panel}>
        <h2>How to fill it in</h2>
        <ul className={styles.muted}>
          <li>department: beauty or kids. kind: bottle, jar, tube, garment, toy or gift (the placeholder picture).</li>
          <li>category: a category ID such as skincare, makeup, hair-care, fragrance, baby-care, kids-toys.</li>
          <li>highlights, free_from and age_bands: several values separated by “;”. Age bands: 0-6m, 6-12m, 1-2y, 3-5y, 6-8y, 9-12y.</li>
          <li>sizes: code:label:price separated by “;”, with * before the default, e.g. 200:200 ml:50;*400:400 ml:85.</li>
          <li>publish: yes or no. Rows missing required details are saved as drafts and the result says what’s missing.</li>
        </ul>
      </section>
      {can(staff.role, 'catalogue.edit') ? (
        <ImportForm />
      ) : (
        <p className={styles.muted}>Your role can’t change the catalogue.</p>
      )}
    </>
  );
}
