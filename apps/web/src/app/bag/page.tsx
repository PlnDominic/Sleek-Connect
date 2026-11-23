import type { Metadata } from 'next';
import { getDeliveryConfig } from '@/lib/catalog';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { BagView } from './BagView';

export const metadata: Metadata = {
  title: 'Your bag',
};

export default async function BagPage() {
  const delivery = await getDeliveryConfig();
  // Only worth showing when some delivery option really becomes free at the threshold.
  const freeFrom = delivery.options.some((o) => o.freeEligible) ? delivery.freeThreshold : null;
  return (
    <>
      <SiteHeader />
      <BagView freeFrom={freeFrom} />
      <SiteFooter />
    </>
  );
}
