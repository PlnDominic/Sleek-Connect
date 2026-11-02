import 'server-only';
import { connection } from 'next/server';
import { cache } from 'react';
import { createUserSupabase } from '@/lib/supabase/server';

export interface VendorMe {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_path: string | null;
  banner_path: string | null;
  announcement: string | null;
  returns_policy: string | null;
  processing_days: number;
  instagram: string | null;
  website: string | null;
  /** The store is paused: its products are hidden until it is resumed. */
  paused: boolean;
  paused_note: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  /** Approved and inside a paid period (or its grace days). */
  live: boolean;
  paid_until: string | null;
  grace_days: number;
  annual_fee_ghs: number;
  payment_instructions: string | null;
  phone: string | null;
  email: string | null;
  review_note: string | null;
  owner_name: string | null;
  id_type: string | null;
}

export interface VendorProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  department: string;
  kind: string;
  category_id: string | null;
  kids_filter: string | null;
  ingredients: string | null;
  country_of_origin: string | null;
  regulatory_reference: string | null;
  period_after_opening: string | null;
  returnable: boolean;
  return_note: string | null;
  age_bands: string[];
  summary: string;
  details: {
    description?: string;
    highlights?: string[];
    recommendedAge?: string;
    warnings?: string;
    howToUse?: string;
  } | null;
  review_status: 'draft' | 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  publish_requested: boolean;
  is_published: boolean;
  vendor_price_ghs: number;
  vendor_was_price_ghs: number | null;
  /** Only once the owner has approved the product. */
  markup_percent: number | null;
  shopper_price_ghs: number | null;
  problems: string[];
  one_size_stock: number | null;
  sizes: { code: string; label: string; vendor_price_ghs: number; is_default: boolean; stock: number }[];
  images: { id: string; path: string }[];
}

export type VendorSession =
  | { state: 'signed_out' }
  | { state: 'ready'; email: string | undefined; vendor: VendorMe | null; supabase: Awaited<ReturnType<typeof createUserSupabase>> };

/** Who is using the vendor area, once per request. The database decides what they may do; this decides what to show. */
export const getVendorSession = cache(async (): Promise<VendorSession> => {
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: 'signed_out' };
  const { data, error } = await supabase.rpc('vendor_me');
  if (error) throw error;
  return { state: 'ready', email: user.email, vendor: (data as unknown as VendorMe | null) ?? null, supabase };
});

/**
 * Where the vendor's store stands on the "Set up your store" checklist. Reads the details the checklist needs (payout account,
 * tax number, terms accepted, how many products) and works out each step. A database without the launch pack yet just counts
 * those steps as not done.
 */
export async function getStoreSetup(
  session: Extract<VendorSession, { state: 'ready' }>,
  vendor: VendorMe,
  productCount?: number,
  /** The result of `vendor_launch_state` when the caller already has it (saves a second call). */
  launchState?: unknown,
) {
  const { storeSetup } = await import('./store-setup');
  const { vendorTermsVersion } = await import('./vendor-terms');
  const data = launchState !== undefined ? launchState : (await session.supabase.rpc('vendor_launch_state')).data;
  const launch = data as unknown as { terms_version: string | null; tin: string | null; payout_account_set: boolean } | null;
  let products = productCount;
  if (products === undefined && vendor.status === 'active') {
    const { data: mine } = await session.supabase.rpc('vendor_my_products');
    products = Array.isArray(mine) ? mine.length : 0;
  }
  return storeSetup({
    status: vendor.status,
    live: vendor.live,
    hasLogo: Boolean(vendor.logo_path),
    hasBanner: Boolean(vendor.banner_path),
    tagline: vendor.tagline,
    description: vendor.description,
    returnsPolicy: vendor.returns_policy ?? null,
    payoutAccountSet: Boolean(launch?.payout_account_set),
    tinSet: Boolean(launch?.tin),
    termsCurrent: launch?.terms_version === vendorTermsVersion,
    productCount: products ?? 0,
  });
}

export interface VendorSection {
  id: string;
  name: string;
}

/** The vendor's sections, in order (empty on a database that doesn't have them yet). */
export async function getVendorSections(session: Extract<VendorSession, { state: 'ready' }>, vendorId: string): Promise<VendorSection[]> {
  const { data } = await session.supabase.from('vendor_sections').select('id, name').eq('vendor_id', vendorId).order('sort_order');
  return (data ?? []) as VendorSection[];
}

/** product id → section id, for the products that are in a section. */
export async function getProductSections(session: Extract<VendorSession, { state: 'ready' }>): Promise<Map<string, string>> {
  const { data } = await session.supabase.rpc('vendor_product_sections');
  const map = new Map<string, string>();
  if (Array.isArray(data)) {
    for (const row of data as { product_id: string; section_id: string | null }[]) if (row.section_id) map.set(row.product_id, row.section_id);
  }
  return map;
}
