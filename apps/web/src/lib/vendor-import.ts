import type { Category } from '@sleek/shared';
import type { Json } from '@/lib/supabase/database.types';

export const importLimit = 200;

export const importColumns = ['name', 'brand', 'department', 'type', 'category', 'price', 'was_price', 'stock', 'summary', 'description'] as const;

export const importTemplate = [
  importColumns.join(','),
  'Shea butter body cream,Sleek,beauty,jar,Body care,45,55,20,Rich daily body cream,"Whipped shea butter that sinks in fast."',
].join('\n');

/** Reads comma-separated text, with quoted fields that may hold commas, quotes ("") and line breaks. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const text = input.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const kindAliases: Record<string, string> = {
  bottle: 'bottle',
  pump: 'bottle',
  jar: 'jar',
  tub: 'jar',
  tube: 'tube',
  garment: 'garment',
  clothing: 'garment',
  fabric: 'garment',
  toy: 'toy',
  gadget: 'toy',
  gift: 'gift',
  set: 'gift',
  box: 'gift',
  bag: 'gift',
};

export interface ImportRow {
  line: number;
  product: Json;
  stock: number | null;
}

/** Turns CSV text into products for `vendor_save_product`, with a message for each line that can't be used. */
export function readImport(input: string, categories: Category[]): { rows: ImportRow[]; problems: string[] } {
  const table = parseCsv(input);
  const problems: string[] = [];
  const rows: ImportRow[] = [];
  if (table.length === 0) return { rows, problems: ['The file is empty.'] };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  if (!header.includes('name')) return { rows, problems: ['The first line must name the columns, starting with "name". Download the template to see how.'] };
  const body = table.slice(1);
  if (body.length === 0) return { rows, problems: ['There are no products under the column names.'] };
  if (body.length > importLimit) return { rows, problems: [`Add up to ${importLimit} products at a time.`] };
  const byName = new Map(categories.flatMap((c) => [[c.id.toLowerCase(), c.id] as const, [c.name.toLowerCase(), c.id] as const]));

  body.forEach((cells, index) => {
    const line = index + 2;
    const get = (key: string) => (cells[header.indexOf(key)] ?? '').trim();
    const name = get('name');
    if (!name) {
      problems.push(`Line ${line}: add a product name.`);
      return;
    }
    const kind = kindAliases[get('type').toLowerCase()] ?? (get('type') ? '' : 'bottle');
    if (!kind) {
      problems.push(`Line ${line}: "${get('type')}" isn't a product type. Use bottle, jar, tube, garment, toy or gift.`);
      return;
    }
    const price = get('price');
    if (!price || !(Number(price) > 0)) {
      problems.push(`Line ${line}: ${name} needs a price above 0.`);
      return;
    }
    const stockText = get('stock');
    const stock = stockText === '' ? null : Number(stockText);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      problems.push(`Line ${line}: stock for ${name} must be a whole number, 0 or more.`);
      return;
    }
    const categoryText = get('category');
    const categoryId = categoryText ? byName.get(categoryText.toLowerCase()) : undefined;
    if (categoryText && !categoryId) {
      problems.push(`Line ${line}: "${categoryText}" isn't one of our categories.`);
      return;
    }
    rows.push({
      line,
      stock,
      product: {
        id: '',
        name,
        brand: get('brand'),
        department: get('department').toLowerCase() || 'beauty',
        kind,
        kids_filter: '',
        category_id: categoryId ?? '',
        price_ghs: price,
        was_price_ghs: get('was_price'),
        sizes: [],
        age_bands: [],
        summary: get('summary'),
        description: get('description'),
        highlights: [],
        publish: true,
      },
    });
  });
  return { rows, problems };
}
