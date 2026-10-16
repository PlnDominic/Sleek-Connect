import { toCsv } from '@/lib/admin/csv';
import { importColumns } from '@/lib/admin/product-import';

/** The bulk import template: the columns plus one example row. */
export function GET() {
  const example: Record<(typeof importColumns)[number], string> = {
    slug: 'rosehip-face-oil',
    name: 'Rosehip Face Oil',
    brand: 'Glow Lab',
    department: 'beauty',
    category: 'skincare',
    kids_filter: '',
    kind: 'bottle',
    price: '150',
    was_price: '',
    tag: 'Cold-pressed · 30 ml',
    summary: 'Lightweight oil for dry skin.',
    description: 'Cold-pressed rosehip seed oil that absorbs quickly.',
    highlights: 'Cold-pressed;Fragrance-free',
    free_from: 'No added fragrance;No mineral oil',
    recommended_age: '',
    warnings: 'For external use only. Stop use if irritation occurs.',
    how_to_use: 'Warm 2-3 drops between fingertips and press onto clean skin.',
    ingredients: 'Rosa Canina Seed Oil, Tocopherol',
    country_of_origin: 'Ghana',
    regulatory_reference: 'FDA/CB.00-000',
    period_after_opening: '12M',
    age_bands: '',
    sizes: '15:15 ml:90;*30:30 ml:150',
    publish: 'no',
  };
  return new Response(toCsv([[...importColumns], importColumns.map((c) => example[c])]), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="sleek-connect-products-template.csv"',
    },
  });
}
