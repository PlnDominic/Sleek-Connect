const base = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let failures = 0;
const assert = (condition, message) => {
  if (!condition) { failures++; console.error('FAIL:', message); }
  else console.log('ok -', message);
};
async function get(path, options = {}) {
  try { return await fetch(`${base}${path}`, { redirect: 'manual', ...options }); }
  catch (error) { failures++; console.error('FAIL:', `${path} unavailable`, error.message); return null; }
}
(async () => {
  const health = await get('/api/health');
  assert(health?.ok || health?.status === 200, 'health endpoint responds');
  const healthBody = health ? await health.json().catch(() => ({})) : {};
  assert(['ok', 'degraded'].includes(healthBody.status), 'health response has an explicit status');
  assert(healthBody.database === 'ok', 'health reports database connectivity');

  for (const path of ['/', '/shop', '/privacy', '/terms', '/help']) {
    const response = await get(path);
    assert(response?.ok, `${path} renders publicly`);
    assert((response?.headers.get('x-content-type-options') || '') === 'nosniff', `${path} has baseline security headers`);
  }
  const robots = await get('/robots.txt');
  const robotsText = robots ? await robots.text() : '';
  assert(robots?.ok && robotsText.includes('Sitemap:'), 'robots.txt points to a sitemap');
  assert(robotsText.includes('Disallow: /admin'), 'robots.txt excludes admin routes');
  const sitemap = await get('/sitemap.xml');
  const sitemapText = sitemap ? await sitemap.text() : '';
  assert(sitemap?.ok && sitemapText.includes('/privacy') && sitemapText.includes('/terms'), 'sitemap includes legal routes');
  const privateRoute = await get('/admin');
  assert((privateRoute?.headers.get('x-robots-tag') || '').includes('noindex'), 'admin route is noindex');
  const missing = await get('/this-route-does-not-exist');
  assert(missing?.status === 404, 'unknown routes return 404');
  process.exitCode = failures ? 1 : 0;
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
})().catch((error) => { console.error(error); process.exitCode = 1; });
