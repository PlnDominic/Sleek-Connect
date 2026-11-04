import type { Metadata } from 'next';
import accountStyles from '../account/account.module.css';
import { SavedList } from './SavedList';

export const metadata: Metadata = { title: 'Saved items', robots: { index: false, follow: true } };

export default function SavedPage() {
  return (
    <>
      <h1>Saved items</h1>
      <p className={accountStyles.muted}>Products you’ve saved for later.</p>
      <SavedList />
    </>
  );
}
