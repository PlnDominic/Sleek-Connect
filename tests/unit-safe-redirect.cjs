// After sign-in the shopper (or staff member) is sent to a "next" path from the address. It must always stay on this site:
// "/\evil.example" and "/<tab>/evil.example" are read by browsers as "//evil.example".
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
const { safeNextPath } = require('../apps/web/src/lib/safe-redirect.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

for (const ok of ['/account', '/orders/0b5f6f5e-0000-4000-8000-000000000000', '/products/some-slug#questions', '/checkout?x=1', '/admin']) {
  assert(safeNextPath(ok) === ok, `keeps the same-site path ${JSON.stringify(ok)}`);
}
for (const bad of [null, undefined, '', 'evil.example', 'https://evil.example', 'javascript:alert(1)', '//evil.example', '///evil.example', '/\\evil.example', '/\\/evil.example', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/ok\u0000', '\\\\evil.example']) {
  assert(safeNextPath(bad) === '/account', `refuses ${JSON.stringify(bad)}`);
}
assert(safeNextPath('//evil.example', '/') === '/', 'a different fallback can be given');
assert(new URL(safeNextPath('/\\evil.example'), 'https://shop.example').origin === 'https://shop.example', 'and what is left never leaves the site');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll safe-redirect checks passed');
process.exit(failures ? 1 : 0);
