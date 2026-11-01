import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { vendorAssetUrl } from '@/lib/photos';
import { getVendorSections, getVendorSession } from '@/lib/vendor';
import { deleteSection, saveSection, saveStore, setStorePaused } from '../actions';
import { ImageUploader } from '../ImageUploader';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Store page' };

export default async function VendorStorePage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor || !['pending', 'active'].includes(session.vendor.status)) redirect('/vendor');
  const { vendor } = session;
  const sections = await getVendorSections(session, vendor.id);
  return (
    <>
      <section className={styles.panel}>
        <h2>Your store page</h2>
        {!vendor.live && <p className={styles.notice}>Shoppers can’t see your store yet. Set it up now; it goes live once we approve it and the yearly fee is paid.</p>}
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
            <span>Store announcement</span>
            <input name="announcement" maxLength={200} defaultValue={vendor.announcement ?? ''} placeholder="Free gift wrap this weekend" />
            <small>Shown in a bar at the top of your store page. Leave empty for none.</small>
          </label>
          <label className={styles.field}>
            <span>Your story</span>
            <textarea name="description" rows={5} maxLength={2000} defaultValue={vendor.description ?? ''} />
            <small>Who you are, how you started and what you make or choose. Shoppers buy from people.</small>
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Packing time (working days)</span>
              <input name="processing_days" type="number" min={1} max={14} defaultValue={vendor.processing_days} />
              <small>How long you need to pack an order after it is paid.</small>
            </label>
            <label className={styles.field}>
              <span>Phone number (private)</span>
              <input name="phone" type="tel" defaultValue={vendor.phone ?? ''} />
              <small>For Sleek Connect only.</small>
            </label>
          </div>
          <label className={styles.field}>
            <span>Returns and care</span>
            <textarea name="returns_policy" rows={3} maxLength={1000} defaultValue={vendor.returns_policy ?? ''} />
            <small>What you accept back and how to look after your products. Our marketplace rules apply on top.</small>
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Instagram</span>
              <input name="instagram" maxLength={61} defaultValue={vendor.instagram ?? ''} placeholder="ama.naturals" autoComplete="off" />
            </label>
            <label className={styles.field}>
              <span>Website</span>
              <input name="website" type="url" maxLength={200} defaultValue={vendor.website ?? ''} placeholder="https://" autoComplete="off" />
            </label>
          </div>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Save store details
            </button>
          </div>
        </VendorForm>
      </section>

      <section className={styles.panel}>
        <h2>Sections</h2>
        <p className={styles.muted}>Group your products into sections, like shelves in a shop. Shoppers can filter your store by section. Choose a product’s section when you edit it.</p>
        {sections.length > 0 && (
          <ul className={styles.list}>
            {sections.map((section) => (
              <li key={section.id} className={styles.listRow}>
                <VendorForm action={saveSection} className={styles.inlineForm}>
                  <input type="hidden" name="id" value={section.id} />
                  <input name="name" required maxLength={40} defaultValue={section.name} aria-label={`Rename ${section.name}`} />
                  <button type="submit" className={styles.secondary}>
                    Rename
                  </button>
                </VendorForm>
                <VendorForm action={deleteSection.bind(null, section.id)} confirm={`Remove the section “${section.name}”? Its products stay in your store.`} className={styles.inlineForm}>
                  <button type="submit" className={styles.danger}>
                    Remove
                  </button>
                </VendorForm>
              </li>
            ))}
          </ul>
        )}
        {sections.length < 12 && (
          <VendorForm action={saveSection} resetOnSuccess>
            <label className={styles.field}>
              <span>New section</span>
              <input name="name" required maxLength={40} placeholder="Body butters" />
            </label>
            <div className={styles.buttons}>
              <button type="submit" className={styles.secondary}>
                Add section
              </button>
            </div>
          </VendorForm>
        )}
      </section>

      {vendor.status === 'active' && (
        <section className={styles.panel}>
          <h2>Vacation mode</h2>
          {vendor.paused ? (
            <>
              <p className={styles.warn}>
                Your store is paused{vendor.paused_note ? `: ${vendor.paused_note}` : ''}. Shoppers can’t see it or buy from it. Orders already placed still need packing.
              </p>
              <VendorForm action={setStorePaused.bind(null, false)}>
                <div className={styles.buttons}>
                  <button type="submit" className={styles.primary}>
                    Reopen my store
                  </button>
                </div>
              </VendorForm>
            </>
          ) : (
            <>
              <p className={styles.muted}>Need a break? Pausing hides your store and products from shoppers. Nothing is deleted, and your yearly fee keeps running. Orders already placed still need packing.</p>
              <VendorForm action={setStorePaused.bind(null, true)} confirm="Pause your store? Shoppers won’t be able to see or buy from it until you reopen it.">
                <label className={styles.field}>
                  <span>Note for your records (optional)</span>
                  <input name="note" maxLength={300} placeholder="Back on 15 December" />
                </label>
                <div className={styles.buttons}>
                  <button type="submit" className={styles.secondary}>
                    Pause my store
                  </button>
                </div>
              </VendorForm>
            </>
          )}
        </section>
      )}
    </>
  );
}
