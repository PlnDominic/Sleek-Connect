// Renders the real admin Settings page (with a faked staff session and settings row) to check what an admin and a non-admin get.
// There are no test buttons (test email, test error): the store is live.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
const Module = require('module');
const path = require('path');
const root = path.resolve(__dirname, '..');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'server-only') return {};
  if (/\.css$/.test(request)) return { __esModule: true, default: new Proxy({}, { get: (_, k) => String(k) }) };
  return origLoad.apply(this, arguments);
};
const req = Module.createRequire(path.join(root, 'package.json'));
req('tsx/cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

const row = { reservation_minutes: 15, low_stock_threshold: 5, expiry_alert_days: 30, max_delivery_attempts: 2, require_delivery_code: true, return_window_days: 7, support_phone: null, support_whatsapp: null, support_email: null, support_hours: null, free_delivery_threshold_ghs: null, pay_on_delivery_enabled: true, pay_on_delivery_hold_hours: 24, pay_on_delivery_max_ghs: null, reorder_lead_days: 7, reorder_cover_days: 21 };
let role = 'admin';
const sessionPath = path.join(root, 'apps/web/src/lib/admin/session.ts');
require.cache[sessionPath] = {
  id: sessionPath, filename: sessionPath, loaded: true, children: [], paths: [],
  exports: {
    requireStaffPage: async () => ({ state: 'ready', role, email: 'boss@example.com', supabase: { from: () => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }) } }),
    can: (r) => r === 'admin',
  },
};

(async () => {
  const { default: SettingsPage } = req(path.join(root, 'apps/web/src/app/admin/settings/page.tsx'));
  const { renderToStaticMarkup } = req('react-dom/server');
  const render = async () => renderToStaticMarkup(await SettingsPage());
  const headings = (html) => [...html.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

  let html = await render();
  const h = headings(html);
  assert(h[0] === 'Settings', `an admin sees the settings page (${h.slice(0, 3).join(' | ')})`);
  assert(!/test (email|error)/i.test(html) && !html.includes('error-reporting'), 'it has no test email or test error buttons');
  assert(h.includes('Customer support'), 'the settings themselves are there');

  role = 'operations';
  html = await render();
  assert(html.includes('Only admins can change store settings'), 'other staff are told it is for admins');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll settings page checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
