import type { Href } from 'expo-router';
import { isDepartment } from '@sleek/shared';

/**
 * Banners are written for the website ("/shop/kids", "/products/newborn-gift-hamper", "/shop?sale=1"). This maps such
 * a link to the matching screen in the app; anything it doesn't know opens the shop.
 */
export function appHref(webHref: string | undefined): Href {
  if (!webHref) return '/shop';
  const [path] = webHref.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'products' && parts[1]) return { pathname: '/product/[slug]', params: { slug: parts[1] } };
  if (parts[0] === 'shop-by-age') return '/shop-by-age';
  if (parts[0] === 'shop' && isDepartment(parts[1])) {
    return { pathname: '/shop', params: parts[2] ? { department: parts[1], category: parts[2] } : { department: parts[1] } };
  }
  return '/shop';
}
