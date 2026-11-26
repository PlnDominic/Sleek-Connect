// The test payment provider and "console" messages are for automated tests only: they need ENABLE_TEST_MODES=true and are never
// available on a Vercel production deployment, whatever else is set.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
const { testModesAllowed } = require('../apps/web/src/lib/dev-modes.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const set = (env) => { for (const k of ['ENABLE_TEST_MODES', 'VERCEL_ENV']) delete process.env[k]; Object.assign(process.env, env); };

set({});
assert(testModesAllowed() === false, 'test modes are off by default');
set({ ENABLE_TEST_MODES: 'yes' });
assert(testModesAllowed() === false, 'and only the exact value true turns them on');
set({ ENABLE_TEST_MODES: 'true' });
assert(testModesAllowed() === true, 'ENABLE_TEST_MODES=true turns them on for tests and local development');
set({ ENABLE_TEST_MODES: 'true', VERCEL_ENV: 'preview' });
assert(testModesAllowed() === true, 'a preview deployment may use them');
set({ ENABLE_TEST_MODES: 'true', VERCEL_ENV: 'production' });
assert(testModesAllowed() === false, 'a production deployment never does, even when the flag is set');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll dev-mode checks passed');
process.exit(failures ? 1 : 0);
