import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getProductsBySlugs } from '@/lib/catalog';
import { ContinueBag } from './ContinueBag';
import styles from '../bag.module.css';

export const metadata: Metadata = {
  title: 'Continue to checkout',
  robots: { index: false, follow: false },
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sizePattern = /^[a-z0-9][a-z0-9-]*$/;

/** `slug:size:qty,slug::qty` (the mobile app's hand-off) as lines. Anything malformed is dropped. */
function parseLines(raw: string): { slug: string; sizeId?: string; qty: number }[] {
  return raw
    .split(',')
    .slice(0, 30)
    .flatMap((part) => {
      const [slug = '', size = '', qtyText = '1'] = part.split(':');
      const qty = Math.round(Number(qtyText));
      if (!slugPattern.test(slug) || (size && !sizePattern.test(size)) || !Number.isFinite(qty) || qty < 1) return [];
      return [{ slug, sizeId: size || undefined, qty: Math.min(qty, 20) }];
    });
}

/**
 * The mobile app's "Continue to secure checkout" opens this page with the bag in the address. Products and prices are
 * read from the catalogue here, never from the address, so only what is really for sale reaches the web bag.
 */
export default function ContinuePage({ searchParams }: PageProps<'/bag/continue'>) {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <Suspense fallback={<p role="status">Preparing your checkout…</p>}>
          <Resolve searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Resolve({ searchParams }: { searchParams: PageProps<'/bag/continue'>['searchParams'] }) {
  const { items } = await searchParams;
  const lines = parseLines(typeof items === 'string' ? items.slice(0, 2000) : '');
  const products = lines.length ? await getProductsBySlugs([...new Set(lines.map((l) => l.slug))]) : [];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  // Keep a line only when its product is on sale and the size (if any) exists.
  const valid = lines.flatMap((l) => {
    const product = bySlug.get(l.slug);
    if (!product) return [];
    if (l.sizeId && !product.sizes?.some((s) => s.id === l.sizeId)) return [];
    return [{ product, sizeId: l.sizeId ?? product.defaultSize, qty: l.qty }];
  });
  return <ContinueBag lines={valid} skipped={lines.length - valid.length} />;
}
