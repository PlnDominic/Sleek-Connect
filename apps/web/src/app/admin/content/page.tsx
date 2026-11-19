import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ContentView, type ContentTab } from './ContentView';

export const metadata: Metadata = { title: 'Content' };

export default async function ContentPage({ searchParams }: PageProps<'/admin/content'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const [{ done, tab }, banners, slots, products] = await Promise.all([
    searchParams,
    staff.supabase.from('banners').select('*').order('placement').order('sort_order').order('updated_at', { ascending: false }),
    staff.supabase.from('merchandising_slots').select('slot, position, products(slug, name, is_published)').order('position'),
    staff.supabase.from('products').select('slug, name, is_published').order('name'),
  ]);
  if (banners.error) throw banners.error;
  if (slots.error) throw slots.error;
  if (products.error) throw products.error;

  return (
    <ContentView
      banners={banners.data}
      slots={slots.data}
      products={products.data}
      edit={can(staff.role, 'content.edit')}
      tab={(tab === 'products' ? 'products' : 'banners') satisfies ContentTab}
      done={done}
      now={new Date().getTime()}
    />
  );
}
