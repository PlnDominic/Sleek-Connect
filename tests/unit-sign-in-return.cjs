// Where someone goes after Google sign-in travels in a cookie (the callback address must stay plain to match Supabase's redirect
// allow-list). The cookie is read back on the server, so it is checked like any other input.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
const { encodeSignInReturn, decodeSignInReturn } = require('../apps/web/src/lib/sign-in-return.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

assert(encodeSignInReturn({ next: '/admin', consent: false }) === '0/admin', 'staff: the console, no shopper consent');
assert(encodeSignInReturn({ next: '/bag', consent: true }) === '1/bag', 'shopper: back to the bag, consent recorded');
assert(same(decodeSignInReturn('0/admin'), { next: '/admin', consent: false }), 'reads the console destination back');
assert(same(decodeSignInReturn('1/bag'), { next: '/bag', consent: true }), 'reads consent back');
assert(same(decodeSignInReturn(encodeURIComponent('0/admin')), { next: '/admin', consent: false }), 'and the percent-encoded form');
assert(same(decodeSignInReturn('0/products/x%20y'), { next: '/products/x%20y', consent: false }), 'a path with its own % survives');
for (const bad of [undefined, null, '', 'admin', '0admin', '2/admin', '0//evil.example', '0/\\evil.example', '0https://evil.example', '1/\t/evil.example']) {
  assert(decodeSignInReturn(bad) === null, `ignores ${JSON.stringify(bad)}`);
}
assert(encodeSignInReturn({ next: '//evil.example', consent: false }) === '0/account', 'an unsafe destination is never written');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll sign-in return checks passed');
process.exit(failures ? 1 : 0);
