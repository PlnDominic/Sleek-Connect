import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { productStandards, vendorTermsUpdated } from '@/lib/vendor-terms';

export const metadata: Metadata = {
  title: 'Product standards',
  description: 'What a product needs to be approved on Sleek Connect Store: photos, descriptions, claims, ingredients, expiry, authenticity, registration and safety.',
  alternates: { canonical: '/sell/standards' },
};

export default function ProductStandardsPage() {
  const sections: LegalSection[] = productStandards.map((s) => ({
    id: s.title.toLowerCase().replace(/[^a-z]+/g, '-'),
    title: s.title,
    body: (
      <ul>
        {s.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    ),
  }));
  return (
    <LegalPage
      title="Product standards"
      updated={vendorTermsUpdated}
      intro={
        <>
          Cosmetics, baby products and food carry real safety risk, so we check every product before it appears. These are the eight
          things we check. See also the <Link href="/sell/terms">seller terms</Link>, including what may not be sold.
        </>
      }
      sections={sections}
    />
  );
}
