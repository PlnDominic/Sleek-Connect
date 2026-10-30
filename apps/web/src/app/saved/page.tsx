import type { Metadata } from 'next';
import styles from '@/components/listing/listing.module.css';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { SavedList } from './SavedList';

export const metadata: Metadata = { title: 'Saved items', robots: { index: false, follow: true } };

export default function SavedPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className={styles.hero}>
          <div className="container">
            <h1>Saved items</h1>
            <p>Products you’ve saved for later.</p>
          </div>
        </div>
        <div className={`container ${styles.savedMain}`}>
          <SavedList />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
