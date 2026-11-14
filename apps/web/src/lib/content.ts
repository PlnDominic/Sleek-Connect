import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { asImageKey, type ImageKey, type Product } from '@sleek/shared';
import { getProductsBySlugs } from './catalog';
import { createSupabase } from './supabase/server';

export interface Banner {
  id: string;
  kicker?: string;
  title: string;
  body?: string;
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  image?: ImageKey;
  theme: 'light' | 'sale' | 'gift';
  countdownTo?: string;
}

/** Live home-page banners and the hero's featured products, as staff set them in the admin console (PRD FR-010). */
export async function getHomeContent(): Promise<{ hero: Banner | null; promos: Banner[]; heroProducts: Product[] }> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const supabase = createSupabase();
  const [{ data: rows, error }, { data: slot }] = await Promise.all([
    supabase.from('banners').select('*').order('sort_order').order('updated_at', { ascending: false }),
    supabase.from('merchandising_slots').select('position, products(slug)').eq('slot', 'home_hero').order('position'),
  ]);
  if (error) throw new Error(`Banners failed to load: ${error.message}`);

  const banners = rows.map(
    (b): Banner & { placement: string } => ({
      id: b.id,
      placement: b.placement,
      kicker: b.kicker ?? undefined,
      title: b.title,
      body: b.body ?? undefined,
      cta: b.cta_label && b.cta_href ? { label: b.cta_label, href: b.cta_href } : undefined,
      secondaryCta:
        b.secondary_cta_label && b.secondary_cta_href ? { label: b.secondary_cta_label, href: b.secondary_cta_href } : undefined,
      image: asImageKey(b.image_key),
      theme: b.theme as Banner['theme'],
      countdownTo: b.countdown_to ?? undefined,
    }),
  );
  const slugs = (slot ?? []).flatMap((r) => (r.products ? [r.products.slug] : []));
  return {
    hero: banners.find((b) => b.placement === 'home_hero') ?? null,
    promos: banners.filter((b) => b.placement === 'home_promo'),
    heroProducts: slugs.length ? await getProductsBySlugs(slugs) : [],
  };
}
