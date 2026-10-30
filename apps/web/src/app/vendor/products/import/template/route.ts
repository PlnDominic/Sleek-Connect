import { importTemplate } from '@/lib/vendor-import';

/** The sample spreadsheet vendors fill in. It holds no private data. */
export function GET() {
  return new Response(`${importTemplate}\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="sleek-connect-products.csv"',
    },
  });
}
