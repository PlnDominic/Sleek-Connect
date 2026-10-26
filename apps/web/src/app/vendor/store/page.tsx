import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { vendorAssetUrl } from '@/lib/photos';
import { getVendorSession } from '@/lib/vendor';
import { saveStore } from '../actions';
import { ImageUploader } from '../ImageUploader';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Store page' };

export default async function VendorStorePage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { vendor } = session;
  return (
      <section className={styles.panel}>
        <h2>Your store page</h2>
        <div className={styles.row}>
          <div>
            <h3>Logo</h3>
            <ImageUploader vendorId={vendor.id} kind="logo" url={vendorAssetUrl(vendor.logo_path)} />
          </div>
          <div>
            <h3>Banner</h3>
            <ImageUploader vendorId={vendor.id} kind="banner" url={vendorAssetUrl(vendor.banner_path)} />
          </div>
        </div>
        <VendorForm action={saveStore}>
          <label className={styles.field}>
            <span>Store name</span>
            <input name="name" required minLength={2} maxLength={60} defaultValue={vendor.name} />
          </label>
          <label className={styles.field}>
            <span>One line about your store</span>
            <input name="tagline" maxLength={120} defaultValue={vendor.tagline ?? ''} />
          </label>
          <label className={styles.field}>
            <span>About your store</span>
            <textarea name="description" rows={4} maxLength={2000} defaultValue={vendor.description ?? ''} />
          </label>
          <label className={styles.field}>
            <span>Phone number (private, for Sleek Connect only)</span>
            <input name="phone" type="tel" defaultValue={vendor.phone ?? ''} />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Save store details
            </button>
          </div>
        </VendorForm>
      </section>
  );
}
