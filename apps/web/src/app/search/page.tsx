import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListingView } from '@/components/listing/ListingView';
import styles from '@/components/listing/listing.module.css';
import { SearchBox } from '@/components/SearchBox';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getAgeBands } from '@/lib/catalog';
import { buildListing, getListingData, readFilters, searchProducts } from '@/lib/listing';
import { didYouMean } from '@/lib/search';

export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<div className={styles.hero}><div className="container"><h1>Search</h1></div></div>}>
          <SearchResults searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function SearchResults({ searchParams }: { searchParams: PageProps<'/search'>['searchParams'] }) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const [{ products, categories }, ageBands, slugs] = await Promise.all([
    getListingData(),
    getAgeBands(),
    q.length >= 2 ? searchProducts(q) : Promise.resolve([] as string[]),
  ]);
  const rank = new Map(slugs.map((slug, i) => [slug, i] as [string, number]));
  const matches = products.filter((p) => rank.has(p.slug));
  const filters = readFilters(params, 'relevance');
  const listing = buildListing(matches, filters, { categories, ageBands, rank, showCategories: true });
  // Only when nothing matched at all (not when filters hide the matches).
  const corrections = q.length >= 2 && matches.length === 0 ? await didYouMean(q) : [];

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <h1>{q ? <>Results for “{q}”</> : 'Search'}</h1>
          <div style={{ marginTop: 16, maxWidth: 560 }}>
            <SearchBox defaultValue={q} autoFocus={!q} />
          </div>
        </div>
      </section>
      <div className="container">
        {q.length < 2 ? (
          <div className={styles.layout}>
            <div className={styles.empty}>
              <h3>What are you looking for?</h3>
              <p>Search by product, brand or category, for example “serum”, “baby wash” or “shea butter”.</p>
              <div className={styles.chips}>
                {categories.map((c) => (
                  <Link key={c.id} href={`/shop/${c.department}/${c.id}`}>
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ListingView
            path="/search"
            listing={listing}
            filters={filters}
            keep={{ q }}
            sorts={['relevance', 'newest', 'rating', 'popular', 'price-asc', 'price-desc']}
            empty={
              <>
                <h3>No results for “{q}”</h3>
                {corrections.length > 0 && (
                  <p>
                    Did you mean{' '}
                    {corrections.map((c, i) => (
                      <span key={c.href}>
                        {i > 0 && ', '}
                        <Link href={c.href}>{c.label}</Link>
                      </span>
                    ))}
                    ?
                  </p>
                )}
                <p>Check the spelling, try a shorter word, or browse a category:</p>
                <div className={styles.chips}>
                  {categories.map((c) => (
                    <Link key={c.id} href={`/shop/${c.department}/${c.id}`}>
                      {c.name}
                    </Link>
                  ))}
                  <Link href="/shop">All products</Link>
                </div>
              </>
            }
          />
        )}
      </div>
    </>
  );
}
