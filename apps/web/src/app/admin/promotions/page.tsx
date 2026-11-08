import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { getCategories } from '@/lib/catalog';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { deletePromotion, savePromotion, setPromotionActive } from './actions';
import { PromotionFields, type Promotion } from './PromotionForm';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Promotions' };

type State = { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' };

function stateOf(p: Promotion): State {
  const now = new Date().getTime();
  if (!p.active) return { label: 'Off', tone: 'neutral' };
  if (p.max_uses !== null && p.used_count >= p.max_uses) return { label: 'Used up', tone: 'warn' };
  if (p.ends_at && Date.parse(p.ends_at) <= now) return { label: 'Ended', tone: 'neutral' };
  if (Date.parse(p.starts_at) > now) return { label: 'Scheduled', tone: 'warn' };
  return { label: 'Live', tone: 'good' };
}

const what = (p: Promotion) => (p.kind === 'percent' ? `${p.value}% off` : p.kind === 'fixed' ? `${formatPrice(p.value)} off` : 'Free delivery');

function conditions(p: Promotion): string {
  const parts: string[] = [];
  if (p.minimum_spend_ghs > 0) parts.push(`spend ${formatPrice(p.minimum_spend_ghs)}+`);
  if (p.first_order_only) parts.push('first order only');
  if (p.allowed_slugs?.length) parts.push(`${p.allowed_slugs.length} product${p.allowed_slugs.length === 1 ? '' : 's'}`);
  if (p.allowed_categories?.length) parts.push(`${p.allowed_categories.length} categor${p.allowed_categories.length === 1 ? 'y' : 'ies'}`);
  return parts.length ? parts.join(' · ') : 'No conditions';
}

export default async function PromotionsPage({ searchParams }: PageProps<'/admin/promotions'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'promotions.manage')) {
    return <p className={styles.notice}>Only admin and finance staff can manage promo codes.</p>;
  }
  const [{ data, error }, categories] = await Promise.all([staff.supabase.rpc('admin_list_promotions'), getCategories()]);
  if (error) {
    // The database may not have the promotions pages' functions yet.
    return <p className={styles.notice}>Promo codes aren’t available yet. The database update for promotions hasn’t been applied.</p>;
  }
  const promos = (data as unknown as Promotion[]) ?? [];
  const cats = categories.map((c) => ({ id: c.id, name: c.name }));
  const { edit: editParam, new: newParam } = await searchParams;
  const adding = newParam !== undefined;
  const editing = typeof editParam === 'string' ? promos.find((p) => p.id === editParam) : undefined;
  const live = promos.filter((p) => stateOf(p).label === 'Live').length;
  const given = promos.reduce((sum, p) => sum + Number(p.discount_given_ghs), 0);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Promotions</h1>
          <p className={styles.muted}>Promo codes shoppers type at checkout. One code works on one order, and it can’t be combined with another.</p>
        </div>
        <Link href="/admin/promotions?new=1" className={styles.primary}>
          New promo code
        </Link>
      </div>

      <section className={styles.panel} aria-label="Summary">
        <p>
          <strong>{live}</strong> live · <strong>{promos.length}</strong> in all · <strong>{formatPrice(given)}</strong> in discounts given on paid orders
        </p>
      </section>

      {adding && (
        <section className={styles.panel} aria-labelledby="new-title">
          <div className={styles.panelHead}>
            <h2 id="new-title">New promo code</h2>
            <Link href="/admin/promotions" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={savePromotion.bind(null, null)} resetOnSuccess>
            <PromotionFields categories={cats}>
              <div className={styles.buttons}>
                <button type="submit" className={styles.primary}>
                  Create promo code
                </button>
              </div>
            </PromotionFields>
          </ActionForm>
        </section>
      )}

      {editing && (
        <section className={styles.panel} aria-labelledby="edit-title">
          <div className={styles.panelHead}>
            <h2 id="edit-title">Edit {editing.code}</h2>
            <Link href="/admin/promotions" className={styles.secondary}>
              Close
            </Link>
          </div>
          <ActionForm action={savePromotion.bind(null, editing.id)}>
            <PromotionFields promo={editing} categories={cats}>
              <div className={styles.buttons}>
                <button type="submit" className={styles.primary}>
                  Save changes
                </button>
              </div>
            </PromotionFields>
          </ActionForm>
        </section>
      )}

      <section className={styles.panel} aria-label="Promo codes">
        {promos.length === 0 ? (
          <p className={styles.empty}>No promo codes yet. Use New promo code to create the first one.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Offer</th>
                  <th>Conditions</th>
                  <th className={styles.num}>Used</th>
                  <th className={styles.num}>Given</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const state = stateOf(p);
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.code}</strong>
                        <div className={styles.muted}>{p.label}</div>
                      </td>
                      <td>{what(p)}</td>
                      <td className={styles.muted}>{conditions(p)}</td>
                      <td className={styles.num}>
                        {p.used_count}
                        {p.max_uses !== null ? ` / ${p.max_uses}` : ''}
                        <div className={styles.muted}>{p.orders} paid {p.orders === 1 ? 'order' : 'orders'}</div>
                      </td>
                      <td className={styles.num}>{formatPrice(Number(p.discount_given_ghs))}</td>
                      <td className={styles.muted}>
                        {Date.parse(p.starts_at) > new Date().getTime() ? `Starts ${formatDateTime(p.starts_at)}` : p.ends_at ? `Ends ${formatDateTime(p.ends_at)}` : 'No end date'}
                      </td>
                      <td>
                        <span className={styles.badge} data-tone={state.tone === 'neutral' ? undefined : state.tone}>{state.label}</span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <Link href={`/admin/promotions?edit=${p.id}`} className={styles.iconButton} title="Edit" aria-label={`Edit ${p.code}`}>
                            <Icon name="pencil" size={16} />
                          </Link>
                          <ActionForm action={setPromotionActive.bind(null, p.id, !p.active)}>
                            <button
                              type="submit"
                              className={styles.iconButton}
                              title={p.active ? 'Switch off' : 'Switch on'}
                              aria-label={p.active ? `Switch off ${p.code}` : `Switch on ${p.code}`}
                            >
                              <Icon name={p.active ? 'eyeOff' : 'eye'} size={16} />
                            </button>
                          </ActionForm>
                          {p.used_count === 0 && p.orders === 0 && (
                            <ActionForm action={deletePromotion.bind(null, p.id)} confirm={`Delete ${p.code}? This can’t be undone.`}>
                              <button type="submit" className={`${styles.iconButton} ${styles.iconDanger}`} title="Delete" aria-label={`Delete ${p.code}`}>
                                <Icon name="trash" size={16} />
                              </button>
                            </ActionForm>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
