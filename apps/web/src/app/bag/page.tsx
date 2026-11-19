import type { Metadata } from 'next';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { BagView } from './BagView';

export const metadata: Metadata = {
  title: 'Your bag',
};

export default function BagPage() {
  return (
    <>
      <SiteHeader />
      <BagView />
      <SiteFooter />
    </>
  );
}
