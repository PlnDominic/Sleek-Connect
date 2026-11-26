// Two small trust checks: which caller address the rate limiter believes, and which return addresses /auth/mobile will redirect to.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
// `server-only` throws unless Next.js loads it for the server; the guarded code is plain functions, so stand it down for this test.
require.cache[require.resolve('server-only')] = { id: 'server-only', filename: 'server-only', loaded: true, exports: {} };
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

(async () => {
  // --- Caller address (apps/web/src/lib/rate-limit.ts) ---
  const { addressFrom } = require('../apps/web/src/lib/rate-limit.ts');
  const from = (headers) => addressFrom((name) => headers[name]);
  delete process.env.VERCEL;
  assert(from({ 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1', 'x-forwarded-for': '1.2.3.4' }) === '203.0.113.9', 'the platform header wins over one the caller could send');
  assert(from({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }) === '198.51.100.7', 'off Vercel (local runs) the forwarded address is used');
  process.env.VERCEL = '1';
  assert(from({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' }) === 'unknown', 'on Vercel a caller-chosen forwarded address is ignored');
  assert(from({ 'x-vercel-forwarded-for': '203.0.113.9' }) === '203.0.113.9', 'on Vercel the platform header is still used');
  delete process.env.VERCEL;

  // --- /auth/mobile only hands a sign-in code to the app's return screen ---
  const { NextRequest } = require('next/server');
  const { GET } = require('../apps/web/src/app/auth/mobile/route.ts');
  const go = (to) => GET(new NextRequest(`https://shop.example/auth/mobile?code=abc&to=${encodeURIComponent(to)}`));
  const ok = go('sleekconnect://auth/callback');
  assert(ok.status === 302 && ok.headers.get('location') === 'sleekconnect://auth/callback?code=abc', 'the app return screen gets the code');
  const expo = go('exp://192.168.1.29:8081/--/auth/callback');
  assert(expo.status === 302 && expo.headers.get('location').startsWith('exp://192.168.1.29:8081/--/auth/callback?code=abc'), 'Expo Go on the developer network gets the code');
  for (const bad of ['sleekconnect://orders/SC-1', 'sleekconnect://auth/other', 'exp://192.168.1.29:8081/--/orders', 'exp://203.0.113.5:8081/--/auth/callback', 'https://evil.example/', 'javascript:alert(1)']) {
    assert(go(bad).status === 404, `refused: ${bad}`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll address and return-address checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
