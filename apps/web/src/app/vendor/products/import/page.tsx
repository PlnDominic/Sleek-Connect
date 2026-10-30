import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { importLimit } from '@/lib/vendor-import';
import { getVendorSession } from '@/lib/vendor';
import { importProducts } from '../../actions';
import { VendorForm } from '../../VendorForm';
import styles from '../../vendor.module.css';

export const metadata: Metadata = { title: 'Add many products' };

export default async function ImportProductsPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  return (
    <>
      <Link href="/vendor/products/new" className={styles.back}>
        ← Add one product instead
      </Link>
      <h1 className={styles.title}>Add many products</h1>
      <p className={styles.lead}>
        Upload a spreadsheet saved as CSV, with up to {importLimit} products. Prices are your own prices. Add photos and stock afterwards; each product is sent for approval like any other.
      </p>
      <section className={styles.panel}>
        <h2>1. Get the template</h2>
        <p className={styles.muted}>
          Columns: name, brand, department (beauty or kids), type (bottle, jar, tube, garment, toy or gift), category, price, was_price, stock, summary, description.
        </p>
        <div className={styles.buttons}>
          <a href="/vendor/products/import/template" className={styles.secondary} download>
            Download the template
          </a>
        </div>
      </section>
      <section className={styles.panel}>
        <h2>2. Upload your file</h2>
        <VendorForm action={importProducts}>
          <label className={styles.field}>
            <span>CSV file</span>
            <input name="file" type="file" accept=".csv,text/csv" required />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Add the products
            </button>
          </div>
        </VendorForm>
      </section>
    </>
  );
}
