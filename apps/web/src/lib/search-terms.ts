/** Words shoppers use for the same thing. Searching any one of them also searches the others. */
const synonyms = [
  ['nappy', 'nappies', 'diaper', 'diapers'],
  ['sunscreen', 'sunblock', 'sun cream'],
  ['moisturiser', 'moisturizer', 'lotion'],
  ['lipstick', 'lip colour', 'lip color'],
  ['face wash', 'cleanser'],
  ['baby wash', 'baby shampoo', 'baby bath'],
  ['hair oil', 'argan oil'],
  ['bodysuit', 'bodysuits', 'onesie', 'onesies', 'babygro'],
  ['hamper', 'gift set', 'gift basket'],
  ['perfume', 'fragrance', 'cologne'],
  ['toy', 'toys', 'plaything'],
  ['puzzle', 'puzzles'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The query itself, then versions of it with a word swapped for a synonym (at most `max` in all). */
export function expandQuery(query: string, max = 4): string[] {
  const original = query.trim();
  const lower = original.toLowerCase();
  const variants = [original];
  for (const group of synonyms) {
    for (const term of group) {
      const at = new RegExp(`(^|\\s)${escape(term)}(?=\\s|$)`);
      if (!at.test(lower)) continue;
      for (const other of group) if (other !== term) variants.push(lower.replace(at, (_, lead: string) => lead + other));
    }
  }
  return [...new Set(variants)].slice(0, max);
}
