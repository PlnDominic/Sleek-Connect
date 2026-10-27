import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { authStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until `apps/mobile/.env` has the project's address and publishable key (see `.env.example`). */
export const configured = Boolean(url && key);

/**
 * The store's database, used with the publishable key (row level security decides what is visible). Shoppers who sign
 * in keep their session on the phone; everyone else browses as a guest.
 */
export const supabase = createClient(url ?? 'https://not-configured.invalid', key ?? 'not-configured', {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
});

/** Public address of a photo in the product-images Storage bucket. */
export function photoUrl(path: string): string {
  return `${url}/storage/v1/object/public/product-images/${path}`;
}

/** Public address of a vendor's logo or banner in the vendor-assets Storage bucket. */
export function vendorAssetUrl(path: string | null): string | undefined {
  return path ? `${url}/storage/v1/object/public/vendor-assets/${path}` : undefined;
}
