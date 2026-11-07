import type { Metadata } from 'next';
import { formatPrice } from '@sleek/shared';
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

export default async function PromotionsPage() {
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
  const live = promos.filter((p) => stateOf(p).label === 'Live').length;
  const given = promos.reduce((sum, p) => sum + Number(p.discount_given_ghs), 0);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Promotions</h1>
          <p className={styles.muted}>Promo codes shoppers type at checkout. One code works on one order, and it can’t be combined with another.</p>
        </div>
      </div>

      <section className={styles.panel} aria-label="Summary">
        <p>
          <strong>{live}</strong> live · <strong>{promos.length}</strong> in all · <strong>{formatPrice(given)}</strong> in discounts given on paid orders
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="new-title">
        <h2 id="new-title">New promo code</h2>
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

      {promos.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.empty}>No promo codes yet.</p>
        </section>
      ) : (
        promos.map((p) => {
          const state = stateOf(p);
          return (
            <section key={p.id} className={styles.panel} aria-label={`Promo code ${p.code}`}>
              <div className={styles.panelHead}>
                <div>
                  <h2>
                    {p.code} <span className={styles.badge} data-tone={state.tone === 'neutral' ? undefined : state.tone}>{state.label}</span>
                  </h2>
                  <p className={styles.muted}>
                    {p.label} · <strong>{what(p)}</strong> · {conditions(p)}
                  </p>
                  <p className={styles.muted}>
                    Used {p.used_count}
                    {p.max_uses !== null ? ` of ${p.max_uses}` : ''} · {p.orders} paid {p.orders === 1 ? 'order' : 'orders'} · {formatPrice(Number(p.discount_given_ghs))} given
                    {p.ends_at ? ` · ends ${formatDateTime(p.ends_at)}` : ''}
                    {Date.parse(p.starts_at) > new Date().getTime() ? ` · starts ${formatDateTime(p.starts_at)}` : ''}
                  </p>
                </div>
              </div>
              <div className={styles.buttons}>
                <ActionForm action={setPromotionActive.bind(null, p.id, !p.active)}>
                  <button type="submit" className={styles.secondary}>
                    {p.active ? 'Switch off' : 'Switch on'}
                  </button>
                </ActionForm>
                {p.used_count === 0 && p.orders === 0 && (
                  <ActionForm action={deletePromotion.bind(null, p.id)} confirm={`Delete ${p.code}? This can’t be undone.`}>
                    <button type="submit" className={styles.secondary}>
                      Delete
                    </button>
                  </ActionForm>
                )}
              </div>
              <details>
                <summary>Edit</summary>
                <div style={{ marginTop: 12 }}>
                  <ActionForm action={savePromotion.bind(null, p.id)}>
                    <PromotionFields promo={p} categories={cats}>
                      <div className={styles.buttons}>
                        <button type="submit" className={styles.primary}>
                          Save changes
                        </button>
                      </div>
                    </PromotionFields>
                  </ActionForm>
                </div>
              </details>
            </section>
          );
        })
      )}
    </>
  );
}
