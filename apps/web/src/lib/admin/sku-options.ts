export interface ProductWithSizes {
  id: string;
  name: string;
  department: string;
  kids_filter: string | null;
  product_sizes: { code: string; label: string; sort_order: number }[];
}

export interface SkuChoice {
  value: string;
  label: string;
  needsExpiry: boolean;
}

/** The select columns `skuChoices` needs from `products`. */
export const skuProductColumns = 'id, name, department, kids_filter, product_sizes(code, label, sort_order)';

/**
 * One choice per product and size, for every product on the products page, including ones that have never had stock
 * (they have no stock row yet, so listing from the stock overview would leave them out). A product without sizes is
 * received under the empty size code.
 */
export function skuChoices(products: ProductWithSizes[]): SkuChoice[] {
  return products.flatMap((p) => {
    const needsExpiry = p.department === 'beauty' || p.kids_filter === 'bath';
    const sizes = [...p.product_sizes].sort((a, b) => a.sort_order - b.sort_order);
    return sizes.length
      ? sizes.map((s) => ({ value: `${p.id}|${s.code}`, label: `${p.name}, ${s.label}`, needsExpiry }))
      : [{ value: `${p.id}|`, label: p.name, needsExpiry }];
  });
}
