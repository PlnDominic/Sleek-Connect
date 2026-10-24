import { Linking } from 'react-native';

const base = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

/** True once `EXPO_PUBLIC_SITE_URL` is set (see `.env.example`). */
export const siteConfigured = base.length > 0;

/** Opens a page of the website in the phone's browser. */
export function openSite(path: string): Promise<unknown> {
  return Linking.openURL(`${base}${path}`);
}

/** The address that carries this bag over to the website's checkout. Only product, size and quantity travel. */
export function checkoutHandoff(lines: { slug: string; sizeId?: string; qty: number }[]): string {
  const items = lines.map((l) => `${l.slug}:${l.sizeId ?? ''}:${l.qty}`).join(',');
  return `/bag/continue?items=${encodeURIComponent(items)}`;
}
