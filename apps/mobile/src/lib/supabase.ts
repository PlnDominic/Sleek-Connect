import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until `apps/mobile/.env` has the project's address and publishable key (see `.env.example`). */
export const configured = Boolean(url && key);

/**
 * The store's database, read with the publishable key (row level security decides what is visible). Nobody signs in
 * yet, so nothing is stored on the device.
 */
export const supabase = createClient(url ?? 'https://not-configured.invalid', key ?? 'not-configured', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/** Public address of a photo in the product-images Storage bucket. */
export function photoUrl(path: string): string {
  return `${url}/storage/v1/object/public/product-images/${path}`;
}

/** Public address of a vendor's logo or banner in the vendor-assets Storage bucket. */
export function vendorAssetUrl(path: string | null): string | undefined {
  return path ? `${url}/storage/v1/object/public/vendor-assets/${path}` : undefined;
}
