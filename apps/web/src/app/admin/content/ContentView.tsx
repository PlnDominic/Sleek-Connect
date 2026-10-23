import Link from 'next/link';
import { Inter } from 'next/font/google';
import { imageFiles } from '@sleek/shared';
import type { Database } from '@/lib/supabase/database.types';
import { ActionForm } from '../ActionForm';
import { Flash } from '../Flash';
import { deleteBanner, saveBanner, saveCollection } from './actions';
import styles from './content.module.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export type BannerRow = Database['public']['Tables']['banners']['Row'];
export interface SlotRow {
  slot: string;
  products: { slug: string; name: string; is_published: boolean } | null;
}
export interface ProductRow {
  slug: string;
  name: string;
  is_published: boolean;
}

export type ContentTab = 'banners' | 'products';

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

const dateText = (ts: string) =>
  new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

function status(b: BannerRow, now: number): { label: string; tone: 'good' | 'warn' | 'bad' | 'off' } {
  if (!b.is_active) return { label: 'Hidden', tone: 'off' };
  if (b.ends_at && Date.parse(b.ends_at) <= now) return { label: 'Ended', tone: 'bad' };
  if (b.starts_at && Date.parse(b.starts_at) > now) return { label: 'Scheduled', tone: 'warn' };
  return { label: 'Live', tone: 'good' };
}

function schedule(b: BannerRow): string {
  if (b.starts_at && b.ends_at) return `${dateText(b.starts_at)} to ${dateText(b.ends_at)}`;
  if (b.starts_at) return `From ${dateText(b.starts_at)}`;
  if (b.ends_at) return `Until ${dateText(b.ends_at)}`;
  return 'Always on';
}

interface ContentViewProps {
  banners: BannerRow[];
  slots: SlotRow[];
  products: ProductRow[];
  edit: boolean;
  tab: ContentTab;
  done: string | string[] | undefined;
  now: number;
}

export function ContentView({ banners, slots, products, edit, tab, done, now }: ContentViewProps) {
  const heroes = banners.filter((b) => b.placement === 'home_hero');
  const promos = banners.filter((b) => b.placement === 'home_promo');

  return (
    <div className={`${inter.className} ${styles.page}`}>
      <header className={styles.head}>
        <div>
          <h1>Content</h1>
          <p className={styles.lede}>
            Manage the banners and featured products on your home page. Changes show on the store straight away.
          </p>
        </div>
        <Link href="/" target="_blank" className={styles.btnSecondary}>
          View home page ↗
        </Link>
      </header>

      <Flash message={done} />

      <nav className={styles.tabs} aria-label="Content sections">
        <Link href="/admin/content" className={styles.tab} aria-current={tab === 'banners' ? 'page' : undefined}>
          Banners <span className={styles.count}>{banners.length}</span>
        </Link>
        <Link
          href="/admin/content?tab=products"
          className={styles.tab}
          aria-current={tab === 'products' ? 'page' : undefined}
        >
          Featured products
        </Link>
      </nav>

      {tab === 'banners' ? (
        <section aria-label="Banners" className={styles.stack}>
          <p className={styles.help}>
            The first live hero banner fills the top of the home page. Live promo cards show further down, in order. Times
            are Accra time.
          </p>
          {edit && (
            <details className={`${styles.banner} ${styles.addBanner}`}>
              <summary className={styles.addSummary}>
                <span className={styles.plus} aria-hidden="true">+</span> Add a banner
              </summary>
              <div className={styles.editor}>
                <ActionForm action={saveBanner.bind(null, null)} resetOnSuccess className={styles.formBody}>
                  <BannerFields />
                  <div className={styles.actions}>
                    <button type="submit" className={styles.btnPrimary}>Add banner</button>
                  </div>
                </ActionForm>
              </div>
            </details>
          )}
          {banners.length === 0 && <p className={styles.empty}>No banners yet. The home page shows the standard hero.</p>}
          {heroes.length > 0 && (
            <div className={styles.group}>
              <h2 className={styles.groupTitle}>Hero banners</h2>
              {heroes.map((b) => (
                <BannerCard key={b.id} banner={b} edit={edit} now={now} />
              ))}
            </div>
          )}
          {promos.length > 0 && (
            <div className={styles.group}>
              <h2 className={styles.groupTitle}>Promo cards</h2>
              {promos.map((b) => (
                <BannerCard key={b.id} banner={b} edit={edit} now={now} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Featured products" className={styles.stack}>
          <p className={styles.help}>
            One product web address per line, in the order to show them (for example{' '}
            <code>vitamin-c-brightening-serum</code>). Drafts and recalled products are skipped on the store.
          </p>
          <div className={styles.collectionGrid}>
            {collections.map((c) => {
              const rows = slots.filter((r) => r.slot === c.slot && r.products);
              const value = rows.map((r) => r.products!.slug).join('\n');
              return (
                <article key={c.slot} className={styles.collection}>
                  <div className={styles.collectionHead}>
                    <h2>{c.label}</h2>
                    <span className={styles.count}>{rows.length}</span>
                  </div>
                  <p className={styles.hint}>{c.hint}</p>
                  {rows.length === 0 ? (
                    <p className={styles.emptySmall}>Nothing picked yet.</p>
                  ) : (
                    <ol className={styles.rows}>
                      {rows.map((r) => (
                        <li key={r.products!.slug}>
                          <span>{r.products!.name}</span>
                          {!r.products!.is_published && <span className={styles.badge} data-tone="off">not on the store</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {edit && (
                    <details className={styles.inline}>
                      <summary className={styles.btnSecondary}>Edit list</summary>
                      <ActionForm action={saveCollection.bind(null, c.slot)} className={styles.formBody}>
                        <label className={styles.field}>
                          <span>Products</span>
                          <textarea name="slugs" rows={Math.max(4, rows.length + 1)} defaultValue={value} />
                        </label>
                        <div className={styles.actions}>
                          <button type="submit" className={styles.btnPrimary}>Save {c.label}</button>
                        </div>
                      </ActionForm>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
          <details className={styles.reference}>
            <summary>All product web addresses ({products.length})</summary>
            <ul>
              {products.map((p) => (
                <li key={p.slug}>
                  <code>{p.slug}</code>
                  <span>{p.name}</span>
                  {!p.is_published && <span className={styles.badge} data-tone="off">draft</span>}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function BannerCard({ banner: b, edit, now }: { banner: BannerRow; edit: boolean; now: number }) {
  const s = status(b, now);
  return (
    <details className={styles.banner}>
      <summary className={styles.bannerSummary}>
        <span className={styles.preview} data-theme={b.theme}>
          {b.kicker && <small>{b.kicker}</small>}
          <strong>{b.title.replace(/\n/g, ' ')}</strong>
        </span>
        <span className={styles.meta}>
          <span className={styles.metaTitle}>{b.title.replace(/\n/g, ' ')}</span>
          <span className={styles.metaLine}>
            <span className={styles.badge} data-tone={s.tone}>{s.label}</span>
            <span>{placements[b.placement as keyof typeof placements]}</span>
          </span>
          <span className={styles.metaLine}>{schedule(b)}</span>
        </span>
        <span className={styles.toggle} aria-hidden="true" />
      </summary>
      <div className={styles.editor}>
        {edit ? (
          <>
            <ActionForm action={saveBanner.bind(null, b.id)} className={styles.formBody}>
              <BannerFields banner={b} />
              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary}>Save banner</button>
              </div>
            </ActionForm>
            <ActionForm
              action={deleteBanner.bind(null, b.id)}
              confirm="Delete this banner? This can’t be undone."
              className={styles.dangerRow}
            >
              <span>Delete this banner for good.</span>
              <button type="submit" className={styles.btnDanger}>Delete banner</button>
            </ActionForm>
          </>
        ) : (
          <p className={styles.help}>{b.body || 'No text.'}</p>
        )}
      </div>
    </details>
  );
}

function BannerFields({ banner }: { banner?: BannerRow }) {
  return (
    <>
      <fieldset className={styles.group2}>
        <legend>Placement and style</legend>
        <div className={styles.grid}>
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
      </fieldset>

      <fieldset className={styles.group2}>
        <legend>Message</legend>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Small heading</span>
            <input name="kicker" defaultValue={banner?.kicker ?? ''} placeholder="Trending now" />
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            <span>Title</span>
            <textarea name="title" required rows={2} defaultValue={banner?.title ?? ''} />
            <small>Line breaks show on the hero.</small>
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            <span>Text</span>
            <textarea name="body" rows={2} defaultValue={banner?.body ?? ''} />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.group2}>
        <legend>Buttons</legend>
        <div className={styles.grid}>
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
      </fieldset>

      <fieldset className={styles.group2}>
        <legend>Schedule</legend>
        <div className={styles.grid}>
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
            <span>Show on the store</span>
          </label>
        </div>
      </fieldset>
    </>
  );
}
