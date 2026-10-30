import { departmentIds, departmentLabels, type AgeBand, type Category } from '@sleek/shared';
import type { VendorProduct } from '@/lib/vendor';
import { saveProduct } from './actions';
import { VendorForm } from './VendorForm';
import styles from './vendor.module.css';

const kinds = [
  ['bottle', 'Bottle or pump'],
  ['jar', 'Jar or tub'],
  ['tube', 'Tube'],
  ['garment', 'Clothing or fabric'],
  ['toy', 'Toy or gadget'],
  ['gift', 'Box, bag or set'],
] as const;

const kidsFilters = [
  ['', 'Not a kids product'],
  ['bath', 'Bath time'],
  ['toys', 'Toys'],
  ['clothing', 'Clothing'],
  ['gifts', 'Gifts'],
] as const;

/** Create or edit one product. Prices here are the vendor's own; the owner adds the markup when approving. */
export function ProductForm({ product, categories, ageBands }: { product?: VendorProduct; categories: Category[]; ageBands: AgeBand[] }) {
  const sizes = product?.sizes ?? [];
  const d = product?.details ?? {};
  return (
    <VendorForm action={saveProduct.bind(null, product?.id ?? null)}>
      <section className={styles.panel}>
        <h2>About the product</h2>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Product name</span>
            <input name="name" required maxLength={120} defaultValue={product?.name} />
          </label>
          <label className={styles.field}>
            <span>Brand</span>
            <input name="brand" defaultValue={product?.brand ?? ''} />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Department</span>
            <select name="department" required defaultValue={product?.department ?? 'beauty'}>
              {departmentIds.map((id) => (
                <option key={id} value={id}>
                  {departmentLabels[id]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Category</span>
            <select name="category_id" required defaultValue={product?.category_id ?? ''}>
              <option value="" disabled>
                Choose a category
              </option>
              {departmentIds.map((dept) => (
                <optgroup key={dept} label={departmentLabels[dept]}>
                  {categories
                    .filter((c) => c.department === dept)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>What it looks like</span>
            <select name="kind" required defaultValue={product?.kind ?? 'bottle'}>
              {kinds.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <small>Used for the placeholder picture until you add photos.</small>
          </label>
        </div>
        <label className={styles.field}>
          <span>Short summary</span>
          <input name="summary" maxLength={160} defaultValue={product?.summary} />
          <small>One line shown under the name in listings.</small>
        </label>
        <label className={styles.field}>
          <span>Description</span>
          <textarea name="description" rows={4} required defaultValue={d.description ?? ''} />
        </label>
        <label className={styles.field}>
          <span>Highlights (one per line)</span>
          <textarea name="highlights" rows={3} defaultValue={(d.highlights ?? []).join('\n')} />
        </label>
      </section>

      <section className={styles.panel}>
        <h2>Price and sizes</h2>
        <p className={styles.muted}>
          Enter the price you want to receive. Sleek Connect adds a small markup when it approves the product, and shoppers see the total.
          Leave the sizes empty if the product comes in one size only.
        </p>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Your price (GH₵)</span>
            <input name="price_ghs" type="number" min={0} step="0.01" defaultValue={sizes.length ? '' : (product?.vendor_price_ghs ?? '')} />
            <small>For a product with sizes, fill the sizes below instead.</small>
          </label>
          <label className={styles.field}>
            <span>Normal price before a sale (optional)</span>
            <input name="was_price_ghs" type="number" min={0} step="0.01" defaultValue={product?.vendor_was_price_ghs ?? ''} />
          </label>
        </div>
        <fieldset className={styles.sizes}>
          <legend>Sizes (up to 4)</legend>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.row}>
              <label className={styles.field}>
                <span>Size {i + 1}, e.g. “200 ml”</span>
                <input name={`size_label_${i}`} defaultValue={sizes[i]?.label ?? ''} maxLength={40} />
              </label>
              <label className={styles.field}>
                <span>Your price (GH₵)</span>
                <input name={`size_price_${i}`} type="number" min={0} step="0.01" defaultValue={sizes[i]?.vendor_price_ghs ?? ''} />
              </label>
            </div>
          ))}
        </fieldset>
      </section>

      <section className={styles.panel}>
        <h2>Details shoppers and regulators expect</h2>
        <label className={styles.field}>
          <span>Ingredients or materials</span>
          <textarea name="ingredients" rows={2} required defaultValue={product?.ingredients ?? ''} placeholder="e.g. Shea butter, coconut oil" />
        </label>
        <label className={styles.field}>
          <span>Safety notes</span>
          <textarea name="warnings" rows={2} required defaultValue={d.warnings ?? ''} placeholder="e.g. For external use only. Keep away from small children." />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Country of origin</span>
            <input name="country_of_origin" required defaultValue={product?.country_of_origin ?? ''} placeholder="Ghana" />
          </label>
          <label className={styles.field}>
            <span>FDA registration number</span>
            <input name="regulatory_reference" defaultValue={product?.regulatory_reference ?? ''} />
            <small>Required for beauty and bath products.</small>
          </label>
          <label className={styles.field}>
            <span>Period after opening</span>
            <input name="period_after_opening" defaultValue={product?.period_after_opening ?? ''} placeholder="e.g. 12M" />
          </label>
        </div>
        <label className={styles.field}>
          <span>How to use (optional)</span>
          <textarea name="how_to_use" rows={2} defaultValue={d.howToUse ?? ''} />
        </label>
      </section>

      <section className={styles.panel}>
        <h2>Baby and kids products</h2>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Kids section</span>
            <select name="kids_filter" defaultValue={product?.kids_filter ?? ''}>
              {kidsFilters.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Recommended age</span>
            <input name="recommended_age" defaultValue={d.recommendedAge ?? ''} placeholder="e.g. 3 years and up" />
          </label>
        </div>
        <fieldset className={styles.checks}>
          <legend>Age groups</legend>
          {ageBands.map((b) => (
            <label key={b.id} className={styles.check}>
              <input type="checkbox" name="age_bands" value={b.id} defaultChecked={product?.age_bands.includes(b.id)} />
              {b.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section className={styles.panel}>
        <h2>Returns and publishing</h2>
        <label className={styles.check}>
          <input type="checkbox" name="returnable" defaultChecked={product?.returnable ?? true} />
          Shoppers can return this product if they change their mind
        </label>
        <label className={styles.field}>
          <span>Return notes (optional)</span>
          <input name="return_note" defaultValue={product?.return_note ?? ''} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="publish" defaultChecked={product?.publish_requested ?? true} />
          Put this product on sale once Sleek Connect has approved it
        </label>
        <div className={styles.buttons}>
          <button type="submit" className={styles.primary}>
            {product ? 'Save product' : 'Add product'}
          </button>
        </div>
      </section>
    </VendorForm>
  );
}
