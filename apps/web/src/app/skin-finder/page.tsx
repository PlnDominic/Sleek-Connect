import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice, type Product } from '@sleek/shared';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { allPublishedProducts, getCategories } from '@/lib/catalog';
import styles from './finder.module.css';

export const metadata: Metadata = {
  title: 'Skin type finder',
  description: 'Tell us your skin type and what you are shopping for, and we will show the products made for you.',
  alternates: { canonical: '/skin-finder' },
};

/** The skin types people recognise, in the order to show them. Types a product is tagged with that aren't here follow. */
const commonSkinTypes = ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive'];
const budgets = [
  { id: 'any', label: 'Any budget', max: Infinity },
  { id: '100', label: `Up to ${formatPrice(100)}`, max: 100 },
  { id: '200', label: `Up to ${formatPrice(200)}`, max: 200 },
  { id: '500', label: `Up to ${formatPrice(500)}`, max: 500 },
] as const;

const norm = (value: string) => value.trim().toLowerCase();
/** Products tagged "All skin types" suit everyone. */
const forEveryone = (type: string) => /^all( skin)?( types?)?$/.test(norm(type));
const suits = (product: Product, skin: string) =>
  (product.skinTypes ?? []).some((t) => norm(t) === norm(skin) || forEveryone(t));
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export default async function SkinFinderPage({ searchParams }: PageProps<'/skin-finder'>) {
  // Await the query before the cached catalogue reads, so the page isn't frozen at build time.
  const params = await searchParams;
  const [products, categories] = await Promise.all([allPublishedProducts(), getCategories()]);

  // The finder only deals with products that say which skin they are for.
  const tagged = products.filter((p) => (p.skinTypes?.length ?? 0) > 0);
  const known = [...new Set(tagged.flatMap((p) => p.skinTypes ?? []).filter((t) => !forEveryone(t)))];
  const skinOptions = [
    ...commonSkinTypes.filter((t) => known.some((k) => norm(k) === norm(t))),
    ...known.filter((k) => !commonSkinTypes.some((t) => norm(t) === norm(k))).sort(),
  ];
  const needIds = new Set(tagged.map((p) => p.category));
  const needOptions = categories.filter((c) => needIds.has(c.id));

  const skin = skinOptions.find((s) => norm(s) === norm(one(params.skin))) ?? '';
  const need = needOptions.find((c) => c.id === one(params.need))?.id ?? '';
  const budget = budgets.find((b) => b.id === one(params.budget)) ?? budgets[0];

  const matches = skin
    ? tagged
        .filter((p) => suits(p, skin) && (!need || p.category === need) && p.price <= budget.max)
        .sort((a, b) => Number(b.inStock !== false) - Number(a.inStock !== false) || (b.popularity ?? 0) - (a.popularity ?? 0) || a.name.localeCompare(b.name))
    : [];

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={`container ${styles.page}`}>
        <h1>Find products for your skin</h1>
        <p className={styles.lead}>
          Three quick choices. We show products made for your skin type. This is a guide, not medical advice: if you have a skin
          condition or an allergy, check the ingredients and ask a pharmacist or doctor.
        </p>

        {skinOptions.length === 0 ? (
          <p className={styles.empty}>
            We haven’t listed skin types on our products yet. <Link href="/shop/beauty">Browse beauty</Link> instead.
          </p>
        ) : (
          <form method="get" action="/skin-finder" className={styles.form}>
            <fieldset>
              <legend>1. Your skin type</legend>
              <div className={styles.choices}>
                {skinOptions.map((s) => (
                  <label key={s} className={styles.choice}>
                    <input type="radio" name="skin" value={s} defaultChecked={s === skin} required />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>2. What are you shopping for?</legend>
              <div className={styles.choices}>
                <label className={styles.choice}>
                  <input type="radio" name="need" value="" defaultChecked={need === ''} />
                  <span>Anything</span>
                </label>
                {needOptions.map((c) => (
                  <label key={c.id} className={styles.choice}>
                    <input type="radio" name="need" value={c.id} defaultChecked={c.id === need} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>3. Your budget</legend>
              <div className={styles.choices}>
                {budgets.map((b) => (
                  <label key={b.id} className={styles.choice}>
                    <input type="radio" name="budget" value={b.id} defaultChecked={b.id === budget.id} />
                    <span>{b.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className={styles.submit}>
              Show my products
            </button>
          </form>
        )}

        {skin && (
          <section aria-labelledby="results-title" className={styles.results}>
            <h2 id="results-title">
              {matches.length === 0
                ? `No ${skin.toLowerCase()} skin products match yet`
                : `${matches.length} product${matches.length === 1 ? '' : 's'} for ${skin.toLowerCase()} skin`}
            </h2>
            {matches.length === 0 ? (
              <p className={styles.empty}>
                Try another budget or “Anything”, or <Link href="/shop/beauty">browse all beauty products</Link>.
              </p>
            ) : (
              <ul className={styles.grid}>
                {matches.map((p) => (
                  <li key={p.slug}>
                    <ProductCard product={p} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
