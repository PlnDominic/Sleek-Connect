// Keeps the "no tracking cookies, no consent banner needed" position true: fails when someone adds an advertising or
// cross-site tracker, a script from another site, or loosens the analytics settings, without also adding consent.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function* sources(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(rel);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield rel;
  }
}
const files = [...sources('apps/web/src'), ...sources('packages/shared/src'), ...sources('apps/mobile/src')];
const all = files.map((f) => [f, read(f)]);

// 1. No advertising or tracking services.
const trackers = /googletagmanager|google-analytics|gtag\(|fbq\(|connect\.facebook|hotjar|clarity\.ms|mixpanel|segment\.com|tiktok.*pixel|doubleclick|adsbygoogle|intercom/i;
// The only allowed exception is Google Tag Manager, in the consent component, which loads nothing until the visitor accepts.
const trackerHits = all.filter(([f, text]) => !f.endsWith('components/AnalyticsConsent.tsx') && trackers.test(text)).map(([f]) => f);
const consent = read('apps/web/src/components/AnalyticsConsent.tsx');
assert(/choice === 'granted' && !isPrivate/.test(consent) && /ad_storage: 'denied'/.test(consent) && /analytics_storage: 'denied'/.test(consent), 'Google Tag Manager loads only after the visitor accepts, never on private pages, with advertising storage denied');
assert(/\(admin\|auth\|account\|orders\|checkout\|track/.test(consent), 'the private pages (account, orders, checkout, track) are excluded from the tag manager');
assert(trackerHits.length === 0, `no advertising or tracking services in the code (${trackerHits.join(', ') || 'none'})`);

// 2. No script loaded from another site.
const external = all.filter(([f, text]) => !f.includes('telemetry') && /<Script[^>]+src=["']https?:/.test(text) || /createElement\(['"]script['"]\)/.test(text)).map(([f]) => f);
assert(external.length === 0, `no script is loaded from another site (${external.join(', ') || 'none'})`);

// 3. Cookies are only written by the sign-in library, never by our own code.
const cookieWrites = all.filter(([, text]) => /document\.cookie\s*=/.test(text)).map(([f]) => f);
assert(cookieWrites.length === 0, `our code writes no cookies of its own (${cookieWrites.join(', ') || 'none'})`);

// 4. Analytics stay anonymous, without storage, clicks or replay.
const analytics = read('apps/web/src/instrumentation-client.ts');
for (const [setting, why] of [
  [/persistence:\s*'memory'/, 'PostHog keeps nothing on the device'],
  [/autocapture:\s*false/, 'PostHog records no clicks or typed text'],
  [/disable_session_recording:\s*true/, 'PostHog records no session replay'],
  [/respect_dnt:\s*true/, 'PostHog respects Do Not Track'],
  [/before_send:\s*\(event\)\s*=>\s*scrubAnalyticsEvent/, 'every PostHog event is scrubbed first'],
]) assert(setting.test(analytics), why);
assert(!/replayIntegration|replaysSessionSampleRate|replaysOnErrorSampleRate/.test(analytics), 'Sentry records no session replay');
assert(/beforeSend:\s*\(event\)\s*=>\s*scrubMonitoringEvent/.test(analytics), 'every Sentry event is scrubbed first');

// 5. The browser may only connect to us, Supabase and Sentry (PostHog goes through /ingest).
const config = read('apps/web/next.config.ts');
const connect = config.match(/`connect-src ([^`]*)`/)[1];
assert(connect === "'self' ${supabaseOrigin} ${sentryOrigin} ${googleAnalytics}", `connect-src allows only ourselves, Supabase, Sentry and Google's measurement hosts (${connect})`);
assert(/script-src \$\{scriptSources\}/.test(config) && !/script-src[^`]*https?:/.test(config) && /tagManager = 'https:\/\/www\.googletagmanager\.com'/.test(config), 'script-src allows no other site than Google Tag Manager');

// 6. The privacy notice says what is on the device and about analytics.
const privacy = read('apps/web/src/app/privacy/page.tsx');
assert(privacy.includes('Visit statistics and error reports') && privacy.includes('Cookies and storage on your device'), 'the privacy notice covers storage on the device and the visit statistics');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll privacy guard checks passed');
process.exit(failures ? 1 : 0);
