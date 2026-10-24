import type { MetadataRoute } from 'next';
import { departmentIds } from '@sleek/shared';
import { allPublishedProducts, getAgeBands, getCategories } from '@/lib/catalog';
import { siteUrl } from '@/lib/site';

/** Every public page a shopper can land on: the shop, its departments and categories, age bands and each product. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [products, categories, bands] = await Promise.all([allPublishedProducts(), getCategories(), getAgeBands()]);
  const page = (path: string, priority: number, changeFrequency: 'daily' | 'weekly' | 'monthly', lastModified?: string) => ({
    url: `${base}${path}`,
    changeFrequency,
    priority,
    ...(lastModified && { lastModified: new Date(lastModified) }),
  });

  return [
    page('/', 1, 'daily'),
    page('/shop', 0.9, 'daily'),
    ...departmentIds.map((d) => page(`/shop/${d}`, 0.8, 'daily')),
    ...categories.map((c) => page(`/shop/${c.department}/${c.id}`, 0.7, 'daily')),
    ...bands.map((b) => page(`/shop-by-age/${b.id}`, 0.6, 'weekly')),
    page('/help', 0.4, 'monthly'),
    page('/terms', 0.2, 'monthly'),
    page('/privacy', 0.2, 'monthly'),
    ...products.map((p) => page(`/products/${p.slug}`, 0.8, 'weekly', p.createdAt)),
  ];
}
