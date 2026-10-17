import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { listingHref, sortOptions, type Filters, type Listing, type SortKey } from '@/lib/listing';
import { FilterForm, SortSelect } from './FilterForm';
import styles from './listing.module.css';

interface ListingViewProps {
  path: string;
  listing: Listing;
  filters: Filters;
  sorts: SortKey[];
  /** Hidden values the filter form must keep, e.g. the search query. */
  keep?: Record<string, string>;
  empty: ReactNode;
}

/** Filter sidebar, sort, results grid and pagination, shared by category pages and search. */
export function ListingView({ path, listing, filters, sorts, keep = {}, empty }: ListingViewProps) {
  const active =
    filters.category.length + filters.brand.length + filters.price.length + filters.age.length + filters.skin.length +
    filters.shade.length + (filters.sale ? 1 : 0) + (filters.inStock ? 1 : 0);
  const from = (listing.page - 1) * 24 + 1;
  const to = from + listing.products.length - 1;

  return (
    <div className={styles.layout}>
      <FilterForm action={path} activeCount={active}>
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {listing.facets.map((facet) => (
          <fieldset key={facet.key} className={styles.facet}>
            <legend>{facet.label}</legend>
            {facet.options.map((o) => (
              <label key={o.value} className={styles.option} data-empty={o.count === 0 && !o.checked}>
                <input type="checkbox" name={facet.key} value={o.value} defaultChecked={o.checked} />
                <span>{o.label}</span>
                <span className={styles.optionCount}>{o.count}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <fieldset className={styles.facet}>
          <legend>Availability</legend>
          <label className={styles.option}>
            <input type="checkbox" name="sale" value="1" defaultChecked={filters.sale} />
            <span>On sale</span>
            <span className={styles.optionCount}>{listing.saleCount}</span>
          </label>
          <label className={styles.option}>
            <input type="checkbox" name="stock" value="1" defaultChecked={filters.inStock} />
            <span>In stock</span>
            <span className={styles.optionCount}>{listing.inStockCount}</span>
          </label>
        </fieldset>
        {active > 0 && (
          <Link href={listingHref(path, filters, { category: null, brand: null, price: null, age: null, skin: null, shade: null, sale: null, stock: null, page: null }, keep)} className={styles.clear} scroll={false}>
            Clear all filters
          </Link>
        )}
      </FilterForm>

      <section className={styles.results} aria-labelledby="results-count">
        <div className={styles.toolbar}>
          <h2 id="results-count" className={styles.count} aria-live="polite">
            {listing.total === 0
              ? 'No products'
              : listing.pages > 1
                ? `${from}–${to} of ${listing.total} products`
                : `${listing.total} ${listing.total === 1 ? 'product' : 'products'}`}
          </h2>
          <SortSelect value={filters.sort} options={sorts.map((s) => [s, sortOptions[s]])} />
        </div>

        {listing.total === 0 ? (
          <div className={styles.empty}>{empty}</div>
        ) : (
          <div className={styles.grid}>
            {listing.products.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        )}

        {listing.pages > 1 && (
          <nav aria-label="Pages" className={styles.pagination}>
            {listing.page > 1 && (
              <Link href={listingHref(path, filters, { page: String(listing.page - 1) }, keep)} rel="prev">
                ← Previous
              </Link>
            )}
            {Array.from({ length: listing.pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={listingHref(path, filters, { page: n > 1 ? String(n) : null }, keep)}
                aria-current={n === listing.page ? 'page' : undefined}
              >
                {n}
              </Link>
            ))}
            {listing.page < listing.pages && (
              <Link href={listingHref(path, filters, { page: String(listing.page + 1) }, keep)} rel="next">
                Next →
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
