import 'server-only';
import { imageFiles } from '@sleek/shared';
import type { StaffSession } from '@/lib/admin/session';

/** Lists the product form needs. */
export async function productFormOptions(supabase: Extract<StaffSession, { state: 'ready' }>['supabase']) {
  const [{ data: categories }, { data: ageBands }] = await Promise.all([
    supabase.from('categories').select('id, name, department').order('sort_order'),
    supabase.from('age_bands').select('id, label').order('sort_order'),
  ]);
  return {
    categories: categories ?? [],
    ageBands: (ageBands ?? []).map((b) => ({ id: b.id, name: b.label })),
    imageKeys: Object.keys(imageFiles),
  };
}
