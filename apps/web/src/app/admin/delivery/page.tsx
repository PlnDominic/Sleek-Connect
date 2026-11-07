import type { Metadata } from 'next';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ActionForm } from '../ActionForm';
import { deleteZone, saveArea, saveOption, saveRates, saveThreshold, saveZone } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Delivery' };

export default async function DeliveryPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'settings.edit')) {
    return <p className={styles.notice}>Only admins can change delivery areas and fees.</p>;
  }
  const db = staff.supabase;
  const [options, zones, rates, areas, settings] = await Promise.all([
    db.from('delivery_options').select('id, label, fee_ghs, free_eligible, days_min, days_max, cutoff_time').order('sort_order'),
    db.from('delivery_zones').select('id, name, sort_order').order('sort_order').order('name'),
    db.from('delivery_rates').select('zone_id, option_id, fee_ghs, is_available'),
    db.from('delivery_areas').select('name, zone_id, is_active, sort_order').order('sort_order'),
    db.from('store_settings').select('free_delivery_threshold_ghs').single(),
  ]);
  for (const r of [options, zones, rates, areas, settings]) if (r.error) throw r.error;
  const optionIds = options.data!.map((o) => o.id);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Delivery</h1>
          <p className={styles.muted}>Delivery areas, fees and estimates. Changes show at checkout straight away.</p>
        </div>
      </div>

      <section className={styles.panel} aria-labelledby="options-title">
        <h2 id="options-title">Delivery options</h2>
        <p className={styles.muted}>Estimates are working days after dispatch. Empty fields show a placeholder to shoppers.</p>
        {options.data!.map((o) => (
          <ActionForm key={o.id} action={saveOption.bind(null, o.id)}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Name</span>
                <input name="label" required maxLength={40} defaultValue={o.label} />
              </label>
              <label className={styles.field}>
                <span>Standard fee (GH₵)</span>
                <input name="fee" inputMode="decimal" defaultValue={o.fee_ghs ?? ''} placeholder="Not set" />
              </label>
              <label className={styles.field}>
                <span>Fastest (days)</span>
                <input name="days_min" type="number" min={0} max={30} defaultValue={o.days_min ?? ''} />
              </label>
              <label className={styles.field}>
                <span>Slowest (days)</span>
                <input name="days_max" type="number" min={0} max={30} defaultValue={o.days_max ?? ''} />
              </label>
              <label className={styles.field}>
                <span>Cut-off time</span>
                <input name="cutoff" type="time" defaultValue={o.cutoff_time?.slice(0, 5) ?? ''} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" name="free" defaultChecked={o.free_eligible} />
                Free over the threshold
              </label>
              <button type="submit" className={styles.secondary}>Save {o.label}</button>
            </div>
          </ActionForm>
        ))}
      </section>

      <section className={styles.panel} aria-labelledby="free-title">
        <h2 id="free-title">Free delivery</h2>
        <ActionForm action={saveThreshold}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Free delivery on orders of at least (GH₵)</span>
              <input name="threshold" inputMode="decimal" defaultValue={settings.data!.free_delivery_threshold_ghs ?? ''} placeholder="No free delivery" />
              <small>Applies to the options ticked “Free over the threshold”. Leave empty to switch it off.</small>
            </label>
            <button type="submit" className={styles.secondary}>Save threshold</button>
          </div>
        </ActionForm>
      </section>

      <section className={styles.panel} aria-labelledby="zones-title">
        <h2 id="zones-title">Zones</h2>
        <p className={styles.muted}>Areas that cost more or less to reach. An empty fee uses the standard fee.</p>
        {zones.data!.length === 0 && <p className={styles.empty}>No zones: every area uses the standard fees.</p>}
        {zones.data!.map((z) => (
          <details key={z.id} className={styles.form}>
            <summary>
              <strong>{z.name}</strong> · {areas.data!.filter((a) => a.zone_id === z.id).map((a) => a.name).join(', ') || 'no areas yet'}
            </summary>
            <ActionForm action={saveRates.bind(null, z.id, optionIds)}>
              <div className={styles.row}>
                {options.data!.map((o) => {
                  const rate = rates.data!.find((r) => r.zone_id === z.id && r.option_id === o.id);
                  return (
                    <fieldset key={o.id} className={styles.field}>
                      <span>{o.label}</span>
                      <input
                        name={`fee:${o.id}`}
                        inputMode="decimal"
                        aria-label={`${o.label} fee in ${z.name}`}
                        defaultValue={rate?.fee_ghs ?? ''}
                        placeholder={o.fee_ghs === null ? 'Standard (not set)' : `Standard (${o.fee_ghs})`}
                      />
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          name={`available:${o.id}`}
                          aria-label={`Offer ${o.label} in ${z.name}`}
                          defaultChecked={rate?.is_available ?? true}
                        />
                        Offered
                      </label>
                    </fieldset>
                  );
                })}
                <button type="submit" className={styles.secondary}>Save {z.name} fees</button>
              </div>
            </ActionForm>
            <ActionForm action={saveZone.bind(null, z.id)}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Zone name</span>
                  <input name="name" required maxLength={60} defaultValue={z.name} />
                </label>
                <label className={styles.field}>
                  <span>Order</span>
                  <input name="sort_order" type="number" defaultValue={z.sort_order} />
                </label>
                <button type="submit" className={styles.secondary}>Rename</button>
              </div>
            </ActionForm>
            <ActionForm action={deleteZone.bind(null, z.id)} confirm={`Delete ${z.name}? Its areas go back to the standard fees.`}>
              <div className={styles.buttons}>
                <button type="submit" className={styles.danger}>Delete zone</button>
              </div>
            </ActionForm>
          </details>
        ))}
        <ActionForm action={saveZone.bind(null, null)} resetOnSuccess>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>New zone</span>
              <input name="name" required maxLength={60} placeholder="e.g. Outer Accra" />
            </label>
            <button type="submit" className={styles.secondary}>Add zone</button>
          </div>
        </ActionForm>
      </section>

      <section className={styles.panel} aria-labelledby="areas-title">
        <h2 id="areas-title">Areas</h2>
        <p className={styles.muted}>Active areas are offered at checkout.</p>
        <ActionForm action={saveArea.bind(null, null)} resetOnSuccess>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>New area</span>
              <input name="name" required maxLength={60} placeholder="e.g. Tema Community 25" />
            </label>
            <label className={styles.field}>
              <span>Zone</span>
              <select name="zone" defaultValue="">
                <option value="">Standard fees</option>
                {zones.data!.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" className={styles.secondary}>Add area</button>
          </div>
        </ActionForm>
        <details className={styles.inline}>
          <summary>Edit areas ({areas.data!.length})</summary>
          {areas.data!.map((a) => (
            <ActionForm key={a.name} action={saveArea.bind(null, a.name)}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Area</span>
                  <input name="name" required maxLength={60} defaultValue={a.name} />
                </label>
                <label className={styles.field}>
                  <span>Zone</span>
                  <select name="zone" defaultValue={a.zone_id ?? ''}>
                    <option value="">Standard fees</option>
                    {zones.data!.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Order</span>
                  <input name="sort_order" type="number" defaultValue={a.sort_order} />
                </label>
                <label className={styles.check}>
                  <input type="checkbox" name="active" defaultChecked={a.is_active} />
                  Delivering here
                </label>
                <button type="submit" className={styles.secondary}>Save</button>
              </div>
            </ActionForm>
          ))}
        </details>
      </section>
    </>
  );
}
