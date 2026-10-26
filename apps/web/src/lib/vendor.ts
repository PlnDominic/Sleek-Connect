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
