import { bagItemFrom, type BagItem } from '@sleek/shared/bag';
import { getBagProducts } from './catalog';

export async function refreshBagLines(lines: BagItem[]) {
  const products = await getBagProducts([...new Set(lines.map((line) => line.slug))]);
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  return lines.map((line) => {
    const product = bySlug.get(line.slug);
    if (!product || (line.sizeId ? !product.sizes?.some((size) => size.id === line.sizeId) : product.sizes?.length)) {
      return { ...line, inStock: false };
    }
    return bagItemFrom(product, line.sizeId, line.qty);
  });
}

export function bagLineChanges(before: BagItem[], after: BagItem[]) {
  return after.flatMap((line, index) => {
    const previous = before[index];
    if (line.inStock === false && previous.inStock !== false) return [{ name: line.name, unavailable: true, price: line.unitPrice }];
    if (previous.unitPrice !== line.unitPrice || (previous.inStock === false && line.inStock !== false)) {
      return [{ name: line.name, unavailable: false, price: line.unitPrice }];
    }
    return [];
  });
}
