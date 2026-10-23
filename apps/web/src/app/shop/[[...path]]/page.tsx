import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Category, Department } from '@sleek/shared';
import { ListingView } from '@/components/listing/ListingView';
import styles from '@/components/listing/listing.module.css';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getAgeBands, getCategories } from '@/lib/catalog';
import { buildListing, getListingData, readFilters } from '@/lib/listing';
import { defaultShareImage } from '@/lib/site';

const departments: Record<Department, { name: string; blurb: string }> = {
  beauty: { name: 'Beauty', blurb: 'Authentic skincare, makeup, hair care and fragrance.' },
  kids: { name: 'Baby & Kids', blurb: 'Safe, age-appropriate essentials, toys and clothing for little ones.' },
};

type Scope = { department?: Department; category?: Category };

/** /shop, /shop/beauty, /shop/beauty/skincare. Unknown paths are 404s. */
async function resolveScope(path: string[] | undefined): Promise<Scope | null> {
  const [dept, cat, ...rest] = path ?? [];
  if (rest.length) return null;
  if (!dept) return {};
  if (dept !== 'beauty' && dept !== 'kids') return null;
  if (!cat) return { department: dept };
  const category = (await getCategories()).find((c) => c.id === cat && c.department === dept);
  return category ? { department: dept, category } : null;
}

export async function generateStaticParams() {
  const categories = await getCategories();
  return [
    { path: [] },
    { path: ['beauty'] },
    { path: ['kids'] },
    ...categories.map((c) => ({ path: [c.department, c.id] })),
  ];
}

export async function generateMetadata({ params }: PageProps<'/shop/[[...path]]'>): Promise<Metadata> {
  const scope = await resolveScope((await params).path);
  if (!scope) return {};
  const title = scope.category?.name ?? (scope.department ? departments[scope.department].name : 'Shop all');
  const description = scope.department ? departments[scope.department].blurb : 'Every product at Sleek Connect Store.';
  // Filtered and paged views of a listing all point at the plain page, so search engines see one copy.
  const canonical = `/shop${scope.department ? `/${scope.department}` : ''}${scope.category ? `/${scope.category.id}` : ''}`;
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, images: [defaultShareImage] }, twitter: { card: 'summary_large_image', images: [defaultShareImage.url] } };
}

export default async function ShopPage({ params, searchParams }: PageProps<'/shop/[[...path]]'>) {
  const scope = await resolveScope((await params).path);
  if (!scope) notFound();
  const categories = await getCategories();
  const title = scope.category?.name ?? (scope.department ? departments[scope.department].name : 'Shop all products');
  const path = `/shop${scope.department ? `/${scope.department}` : ''}${scope.category ? `/${scope.category.id}` : ''}`;
  const siblings = categories.filter((c) => !scope.department || c.department === scope.department);

  return (
    <>
      <SiteHeader current="Shop" />
      <main>
        <section className={styles.hero}>
          <div className="container">
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <Link href="/">Home</Link>/<Link href="/shop">Shop</Link>
              {scope.department && (
                <>
                  /<Link href={`/shop/${scope.department}`}>{departments[scope.department].name}</Link>
                </>
              )}
            </nav>
            <h1>{title}</h1>
            <p>{scope.department ? departments[scope.department].blurb : 'Authentic beauty and safe essentials for little ones.'}</p>
            <nav aria-label={scope.department ? 'Categories' : 'Departments'} className={styles.subnav}>
              {scope.department ? (
                <>
                  <Link href={`/shop/${scope.department}`} aria-current={!scope.category ? 'page' : undefined}>
                    All {departments[scope.department].name}
                  </Link>
                  {siblings.map((c) => (
                    <Link key={c.id} href={`/shop/${c.department}/${c.id}`} aria-current={c.id === scope.category?.id ? 'page' : undefined}>
                      {c.name}
                    </Link>
                  ))}
                </>
              ) : (
                (Object.keys(departments) as Department[]).map((d) => (
                  <Link key={d} href={`/shop/${d}`}>
                    {departments[d].name}
                  </Link>
                ))
              )}
            </nav>
          </div>
        </section>
        <div className="container">
          <Suspense fallback={<p className={styles.count}>Loading products…</p>}>
            <Results scope={scope} path={path} searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function Results({ scope, path, searchParams }: { scope: Scope; path: string; searchParams: PageProps<'/shop/[[...path]]'>['searchParams'] }) {
  // Read the URL first: cached data fetched before this point would be frozen into the build-time shell and replayed
  // once after staff change the catalogue.
  const params = await searchParams;
  const [{ products, categories, featured }, ageBands] = await Promise.all([getListingData(), getAgeBands()]);
  const filters = readFilters(params, 'featured');
  const inScope = products.filter(
    (p) => (!scope.department || p.department === scope.department) && (!scope.category || p.category === scope.category.id),
  );
  const listing = buildListing(inScope, filters, {
    categories,
    ageBands,
    rank: new Map(featured),
    showCategories: !scope.category,
  });

  return (
    <ListingView
      path={path}
      listing={listing}
      filters={filters}
      sorts={['featured', 'newest', 'price-asc', 'price-desc']}
      empty={
        <>
          <h3>No products match these filters</h3>
          <p>Try removing a filter, or browse everything we have.</p>
          <Link href={path}>Clear all filters</Link>
        </>
      }
    />
  );
}
