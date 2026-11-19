import { departmentIds, departmentLabels } from '@sleek/shared';
import { getCategories } from '@/lib/catalog';
import { siteName, siteUrl } from '@/lib/site';

/**
 * /llms.txt: a plain summary of the store for AI assistants and answer engines (generative engine optimisation). It says what the
 * store is, what it sells and where its policies are, in the order an assistant needs them, and links only to public pages.
 */
export async function GET() {
  const base = siteUrl();
  const categories = await getCategories();
  const departments = departmentIds
    .map((d) => ({ d, categories: categories.filter((c) => c.department === d) }))
    .filter((x) => x.categories.length > 0);

  const lines = [
    `# ${siteName}`,
    '',
    `> ${siteName} is an online general-merchandise store in Accra, Ghana. It sells everyday products across beauty, baby and kids, home and groceries, fashion and accessories, electronics and more, with delivery across Accra. Customers pay with Mobile Money (MTN MoMo, Telecel Cash, AT Money) or a Visa or Mastercard card, in Ghana cedis (GH₵).`,
    '',
    '## About',
    `- The store buys from suppliers and brands and sells to shoppers directly; it is one store, not a marketplace of third-party sellers.`,
    '- Delivery: Accra, with delivery fees and times shown at checkout by location. Orders are tracked from packing to the door.',
    '- Checkout needs a free account. Online payment only; there is no cash on delivery.',
    '',
    '## Shop',
    `- [All products](${base}/shop)`,
    ...departments.flatMap(({ d, categories: cs }) => [
      `- [${departmentLabels[d]}](${base}/shop/${d})`,
      ...cs.map((c) => `  - [${c.name}](${base}/shop/${c.department}/${c.id})`),
    ]),
    '',
    '## Help and policies',
    `- [Help, delivery and returns](${base}/help)`,
    `- [Terms of service](${base}/terms)`,
    `- [Privacy notice](${base}/privacy)`,
    `- [Track an order](${base}/track)`,
    '',
    '## For machines',
    `- [Sitemap](${base}/sitemap.xml)`,
    '- Each product page carries schema.org Product, Offer and BreadcrumbList data.',
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
