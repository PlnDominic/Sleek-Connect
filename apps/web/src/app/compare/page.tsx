import type { Metadata } from 'next';
import { CompactHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CompareClient } from './CompareClient';

// The list is whatever this visitor picked, so there is nothing for a search engine to index.
export const metadata: Metadata = {
  title: 'Compare products',
  description: 'Compare the products you picked side by side: price, size, ingredients and more.',
  robots: { index: false, follow: true },
};

export default function ComparePage() {
  return <><CompactHeader /><CompareClient /><SiteFooter /></>;
}
