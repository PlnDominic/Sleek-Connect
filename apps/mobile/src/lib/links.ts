import type { Href } from 'expo-router';
import { isDepartment } from '@sleek/shared';

/**
 * Banners are written for the website ("/shop/kids", "/products/newborn-gift-hamper", "/shop?sale=1"). This maps such
 * a link to the matching screen in the app; anything it doesn't know opens the shop.
 */
export function appHref(webHref: string | undefined, entry = ''): Href {
  const [path, query] = (webHref ?? '/shop').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'products' && parts[1]) return { pathname: '/product/[slug]', params: { slug: parts[1] } };
  const department = parts[0] === 'shop-by-age' ? 'kids' : parts[0] === 'shop' && isDepartment(parts[1]) ? parts[1] : '';
  const sale = parts[0] === 'shop' && new URLSearchParams(query).get('sale') === '1';
  return {
    pathname: '/shop',
    params: { department, category: department ? parts[2] ?? '' : '', sale: sale ? '1' : '', sort: sale ? 'saving' : '', focus: '', entry },
  };
}
