import 'server-only';
import { imageFiles } from '@sleek/shared';
import type { StaffSession } from '@/lib/admin/session';

/** Lists the product form needs. */
export async function productFormOptions(supabase: Extract<StaffSession, { state: 'ready' }>['supabase']) {
  const [{ data: categories }, { data: ageBands }, { data: sizeGuides }] = await Promise.all([
    supabase.from('categories').select('id, name, department').order('sort_order'),
    supabase.from('age_bands').select('id, label').order('sort_order'),
    // Size guides may not exist yet on a database that hasn't had the latest migration: no guides then.
    supabase.from('size_guides').select('id, title').order('title'),
  ]);
  return {
    categories: categories ?? [],
    ageBands: (ageBands ?? []).map((b) => ({ id: b.id, name: b.label })),
    imageKeys: Object.keys(imageFiles),
    sizeGuides: (sizeGuides ?? []).map((g) => ({ id: g.id, name: g.title })),
  };
}
