import type { Metadata } from 'next';
import Link from 'next/link';
import { imageFiles } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import type { Database } from '@/lib/supabase/database.types';
import { ActionForm } from '../ActionForm';
import { Flash } from '../Flash';
import { deleteBanner, saveBanner, saveCollection } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Content' };

type BannerRow = Database['public']['Tables']['banners']['Row'];

const placements = { home_hero: 'Home page hero', home_promo: 'Home page promo card' } as const;
const themes = { light: 'Light', sale: 'Sale (dark)', gift: 'Gift (pink)' } as const;

/** Featured collections on the web store, in the order staff see them. */
const collections = [
  { slot: 'home_hero', label: 'Hero products', hint: 'The cards floating around the hero photo (up to 4).' },
  { slot: 'home_new_arrivals', label: 'New Arrivals', hint: 'The New Arrivals row on the home page.' },
  {
    slot: 'home_best_sellers',
    label: 'Best Sellers',
    hint: 'The Best Sellers grid on the home page. Also comes first when shoppers sort shop pages by “Featured”.',
  },
  { slot: 'product_related', label: 'You may also like', hint: 'Shown under every product page.' },
];

/** A stored timestamp as a `datetime-local` value (Accra time is GMT). */
const local = (ts: string | null) => (ts ? new Date(ts).toISOString().slice(0, 16) : '');

function status(b: BannerRow, now: number): { label: string; tone?: 'good' | 'warn' | 'bad' } {
  if (!b.is_active) return { label: 'Hidden' };
  if (b.ends_at && Date.parse(b.ends_at) <= now) return { label: 'Ended', tone: 'bad' };
  if (b.starts_at && Date.parse(b.starts_at) > now) return { label: 'Scheduled', tone: 'warn' };
  return { label: 'Live', tone: 'good' };
}

export default async function ContentPage({ searchParams }: PageProps<'/admin/content'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const [{ done }, banners, slots, products] = await Promise.all([
    searchParams,
    staff.supabase.from('banners').select('*').order('placement').order('sort_order').order('updated_at', { ascending: false }),
    staff.supabase.from('merchandising_slots').select('slot, position, products(slug, name, is_published)').order('position'),
    staff.supabase.from('products').select('slug, name, is_published').order('name'),
  ]);
  if (banners.error) throw banners.error;
  if (slots.error) throw slots.error;
  if (products.error) throw products.error;
  const edit = can(staff.role, 'content.edit');
  const now = new Date().getTime();

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Content</h1>
          <p className={styles.muted}>
            Home page banners and featured products. Changes show on the store straight away.{' '}
            <Link href="/" target="_blank">Open the home page</Link>
          </p>
        </div>
      </div>
      <Flash message={done} />

      <section className={styles.panel} aria-labelledby="banners">
        <h2 id="banners">Banners</h2>
        <p className={styles.muted}>
          The first live hero banner fills the top of the home page; live promo cards show further down, in order. Times
          are Accra time.
        </p>
        {banners.data.length === 0 && <p className={styles.empty}>No banners. The home page shows the standard hero.</p>}
        {banners.data.map((b) => {
          const s = status(b, now);
          return (
            <details key={b.id} className={styles.form}>
              <summary>
                <strong>{b.title.replace(/\n/g, ' ')}</strong> · {placements[b.placement as keyof typeof placements]} ·{' '}
                <span className={styles.badge} data-tone={s.tone}>{s.label}</span>
              </summary>
              {edit ? (
                <>
                  <ActionForm action={saveBanner.bind(null, b.id)}>
                    <BannerFields banner={b} />
                    <div className={styles.buttons}>
                      <button type="submit" className={styles.primary}>Save banner</button>
                    </div>
                  </ActionForm>
                  <ActionForm action={deleteBanner.bind(null, b.id)} confirm="Delete this banner? This can’t be undone.">
                    <div className={styles.buttons}>
                      <button type="submit" className={styles.danger}>Delete banner</button>
                    </div>
                  </ActionForm>
                </>
              ) : (
                <p className={styles.muted}>{b.body}</p>
              )}
            </details>
          );
        })}
        {edit && (
          <details className={styles.form}>
            <summary><strong>Add a banner</strong></summary>
            <ActionForm action={saveBanner.bind(null, null)} resetOnSuccess>
              <BannerFields />
              <div className={styles.buttons}>
                <button type="submit" className={styles.primary}>Add banner</button>
              </div>
            </ActionForm>
          </details>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="collections">
        <h2 id="collections">Featured products</h2>
        <p className={styles.muted}>
          One product web address per line, in the order to show them (for example <code>vitamin-c-brightening-serum</code>).
          Drafts and recalled products are skipped on the store.
        </p>
        <div className={styles.columns}>
          {collections.map((c) => {
            const rows = slots.data.filter((r) => r.slot === c.slot && r.products);
            const value = rows.map((r) => r.products!.slug).join('\n');
            return (
              <div key={c.slot}>
                <h3>{c.label}</h3>
                <p className={styles.muted}>{c.hint}</p>
                {edit ? (
                  <ActionForm action={saveCollection.bind(null, c.slot)}>
                    <label className={styles.field}>
                      <span>Products</span>
                      <textarea name="slugs" rows={Math.max(4, rows.length + 1)} defaultValue={value} />
                    </label>
                    <div className={styles.buttons}>
                      <button type="submit" className={styles.secondary}>Save {c.label}</button>
                    </div>
                  </ActionForm>
                ) : null}
                <ol>
                  {rows.map((r) => (
                    <li key={r.products!.slug}>
                      {r.products!.name} {!r.products!.is_published && <span className={styles.badge}>not on the store</span>}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
        <details>
          <summary>All product web addresses</summary>
          <ul>
            {products.data.map((p) => (
              <li key={p.slug}>
                <code>{p.slug}</code> · {p.name} {!p.is_published && <span className={styles.badge}>draft</span>}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}

function BannerFields({ banner }: { banner?: BannerRow }) {
  return (
    <>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Where</span>
          <select name="placement" defaultValue={banner?.placement ?? 'home_promo'}>
            {Object.entries(placements).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Colours</span>
          <select name="theme" defaultValue={banner?.theme ?? 'light'}>
            {Object.entries(themes).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <small>For promo cards.</small>
        </label>
        <label className={styles.field}>
          <span>Photo</span>
          <select name="image_key" defaultValue={banner?.image_key ?? ''}>
            <option value="">None</option>
            {Object.keys(imageFiles).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Order</span>
          <input name="sort_order" type="number" step={1} defaultValue={banner?.sort_order ?? 0} />
          <small>Lower numbers first.</small>
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Small heading</span>
          <input name="kicker" defaultValue={banner?.kicker ?? ''} placeholder="Trending now" />
        </label>
        <label className={styles.field}>
          <span>Title</span>
          <textarea name="title" required rows={2} defaultValue={banner?.title ?? ''} />
          <small>Line breaks show on the hero.</small>
        </label>
        <label className={styles.field}>
          <span>Text</span>
          <textarea name="body" rows={2} defaultValue={banner?.body ?? ''} />
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Button label</span>
          <input name="cta_label" defaultValue={banner?.cta_label ?? ''} placeholder="Shop Now" />
        </label>
        <label className={styles.field}>
          <span>Button link</span>
          <input name="cta_href" defaultValue={banner?.cta_href ?? ''} placeholder="/shop?sale=1" />
        </label>
        <label className={styles.field}>
          <span>Second button label</span>
          <input name="secondary_cta_label" defaultValue={banner?.secondary_cta_label ?? ''} />
          <small>Hero only.</small>
        </label>
        <label className={styles.field}>
          <span>Second button link</span>
          <input name="secondary_cta_href" defaultValue={banner?.secondary_cta_href ?? ''} placeholder="/shop/kids" />
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Show from</span>
          <input name="starts_at" type="datetime-local" defaultValue={local(banner?.starts_at ?? null)} />
        </label>
        <label className={styles.field}>
          <span>Show until</span>
          <input name="ends_at" type="datetime-local" defaultValue={local(banner?.ends_at ?? null)} />
        </label>
        <label className={styles.field}>
          <span>Countdown to</span>
          <input name="countdown_to" type="datetime-local" defaultValue={local(banner?.countdown_to ?? null)} />
          <small>Promo cards show a live timer.</small>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="is_active" defaultChecked={banner?.is_active ?? true} />
          Show on the store
        </label>
      </div>
    </>
  );
}
