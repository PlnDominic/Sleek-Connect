const fs = require('fs');
const path = require('path');
const base = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base);
let failures = 0;
const assert = (condition, message) => {
  if (!condition) { failures++; console.error('FAIL:', message); }
  else console.log('ok -', message);
};
async function get(pathname, options = {}) {
  try { return await fetch(`${base}${pathname}`, { redirect: 'manual', ...options }); }
  catch (error) { failures++; console.error('FAIL:', `${pathname} unavailable`, error.message); return null; }
}
/** The local .env.local, so local runs can prove the authorised dispatcher path too. */
function localEnv() {
  try {
    const file = path.resolve(__dirname, '../apps/web/.env.local');
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  } catch { return {}; }
}
(async () => {
  // --- Health: database, integrations, deployed schema and required environment (items 7, 15, 1-3) ---
  const health = await get('/api/health');
  assert(health?.ok || health?.status === 200, 'health endpoint responds');
  const healthBody = health ? await health.json().catch(() => ({})) : {};
  assert(['ok', 'degraded'].includes(healthBody.status), 'health response has an explicit status');
  assert(healthBody.database === 'ok', 'health reports database connectivity');
  assert(typeof healthBody.status === 'string' && healthBody.status === 'ok', `health is ok with this environment (${healthBody.status}, schema=${healthBody.checks?.schema}, missing=${JSON.stringify(healthBody.environment?.missing)})`);
  for (const check of ['payment', 'sms', 'email', 'auth', 'webhook', 'dispatcher', 'jobs']) {
    assert(typeof healthBody.integrations?.[check] === 'string', `health reports the ${check} integration`);
  }
  assert(healthBody.checks?.schema === 'ok', 'the deployed schema matches the application (items 1 and 2)');
  assert(Array.isArray(healthBody.environment?.missing) && healthBody.environment.ok === true, 'every required environment variable is set, by name only (item 3)');
  assert(typeof healthBody.checks?.delivery === 'string' && typeof healthBody.checks?.support === 'string', 'health reports delivery and support readiness (item 14)');

  // --- Security headers (item 8) -------------------------------------------------------------------
  for (const path of ['/', '/shop', '/privacy', '/terms']) {
    const response = await get(path);
    assert(response?.ok, `${path} renders publicly`);
    assert((response?.headers.get('x-content-type-options') || '') === 'nosniff', `${path} has baseline security headers`);
  }
  const home = await get('/');
  const csp = home?.headers.get('content-security-policy') || '';
  assert(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), 'content security policy restricts sources and framing');
  assert((home?.headers.get('x-frame-options') || '') === 'DENY', 'pages cannot be framed');
  assert((home?.headers.get('referrer-policy') || '') === 'strict-origin-when-cross-origin', 'referrer policy is strict');
  assert((home?.headers.get('permissions-policy') || '').includes('geolocation=()'), 'permissions policy denies unused capabilities');
  assert((home?.headers.get('strict-transport-security') || '').includes('max-age=63072000'), 'HSTS is set (production build)');

  // --- Private routes stay out of search results ---------------------------------------------------
  for (const path of ['/admin', '/bag', '/account']) {
    const response = await get(path);
    assert((response?.headers.get('x-robots-tag') || '').includes('noindex'), `${path} route is noindex`);
  }

  // --- Scheduled job entry point is authenticated (item 7) ------------------------------------------
  const dispatch = await get('/api/notifications/dispatch');
  assert(dispatch?.status === 401, 'the notification dispatcher refuses anonymous calls');
  if (isLocal && localEnv().CRON_SECRET) {
    const authorised = await get('/api/notifications/dispatch', { headers: { authorization: `Bearer ${localEnv().CRON_SECRET}` } });
    assert(authorised?.status === 200, 'the notification dispatcher accepts the cron secret');
  }

  // --- Sign-in callback cannot leave the site (item 16) ---------------------------------------------
  for (const callback of ['/auth/callback?next=https://evil.example', '/auth/callback?code=not-a-real-code&next=//evil.example']) {
    const response = await get(callback);
    const location = response?.headers.get('location');
    const stays = response && location && new URL(location, base).origin === new URL(base).origin && !location.includes('evil.example');
    assert(stays, `${callback} redirects on the same site (${response?.status} ${location})`);
  }

  // --- Legal pages carry no bracketed placeholders (item 17) -----------------------------------------
  for (const [path, heading] of [['/terms', 'Terms of service'], ['/privacy', 'Privacy notice']]) {
    const response = await get(path);
    const text = response ? await response.text() : '';
    assert(response?.ok && text.includes(heading), `${path} renders for launch`);
    assert(!/\[[A-Z][A-Z0-9_]{3,}\]/.test(text) && !text.includes('To be set'), `${path} shows no bracketed placeholder`);
  }

  // --- Sitemap, robots and 404 ----------------------------------------------------------------------
  const robots = await get('/robots.txt');
  const robotsText = robots ? await robots.text() : '';
  assert(robots?.ok && robotsText.includes('Sitemap:'), 'robots.txt points to a sitemap');
  assert(robotsText.includes('Disallow: /admin'), 'robots.txt excludes admin routes');
  const sitemap = await get('/sitemap.xml');
  const sitemapText = sitemap ? await sitemap.text() : '';
  assert(sitemap?.ok && sitemapText.includes('/privacy') && sitemapText.includes('/terms'), 'sitemap includes legal routes');
  const missing = await get('/this-route-does-not-exist');
  const missingText = missing ? await missing.text() : '';
  assert(missing?.status === 404, 'unknown routes return 404');
  assert(missingText.includes('Page not found'), 'the 404 page is the branded one');

  process.exitCode = failures ? 1 : 0;
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
})().catch((error) => { console.error(error); process.exitCode = 1; });
