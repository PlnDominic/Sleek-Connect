// The "Set up your store" checklist: what is done, what is locked until approval, and what comes next.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
const { storeSetup } = require('../apps/web/src/lib/store-setup.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

const blank = { status: 'pending', live: false, hasLogo: false, hasBanner: false, tagline: null, description: null, returnsPolicy: null, payoutAccountSet: false, tinSet: false, termsCurrent: false, productCount: 0 };
const ids = (setup, pick) => setup.steps.filter(pick).map((s) => s.id);

const fresh = storeSetup(blank);
assert(fresh.total === 12 && fresh.done === 1 && fresh.percent === 8, 'a new application has only the application step done');
assert(ids(fresh, (s) => s.locked).join() === 'product,payout,tax,terms,open', 'products, payout, tax, terms and opening are locked until the store is approved');
assert(fresh.next.id === 'tagline', 'the next step is the first one that can be done now (the approval is up to us)');

const profile = storeSetup({ ...blank, tagline: 'Pure shea butter from Tamale', hasLogo: true, hasBanner: true, description: 'x'.repeat(90), returnsPolicy: 'Unopened jars come back within 7 days.' });
assert(ids(profile, (s) => s.done).join() === 'apply,tagline,logo,banner,story,policies', 'tagline, logo, banner, story and policy tick off as they are filled in');
assert(profile.next === null, 'while pending and with the profile done there is nothing left for the vendor to do');
assert(storeSetup({ ...blank, tagline: 'short', description: 'too short' }).done === 1, 'a tagline under 10 characters or a story under 80 does not count');

const approved = storeSetup({ ...blank, status: 'active' });
assert(ids(approved, (s) => s.locked).length === 0 && approved.steps.find((s) => s.id === 'approval').done, 'approval unlocks the rest');
assert(approved.next.id === 'tagline', 'and the profile steps come first');

const ready = storeSetup({ ...blank, status: 'active', tagline: 'Pure shea butter from Tamale', hasLogo: true, hasBanner: true, description: 'x'.repeat(90), returnsPolicy: 'Unopened jars come back within 7 days.', productCount: 1, payoutAccountSet: true, tinSet: true, termsCurrent: true });
assert(ready.next.id === 'open' && ready.done === 11, 'with everything else done, only paying the yearly fee is left');
const live = storeSetup({ ...blank, status: 'active', live: true, tagline: 'Pure shea butter from Tamale', hasLogo: true, hasBanner: true, description: 'x'.repeat(90), returnsPolicy: 'Unopened jars come back within 7 days.', productCount: 1, payoutAccountSet: true, tinSet: true, termsCurrent: true });
assert(live.percent === 100 && live.next === null, 'a live, fully set up store is 100%');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll store setup checks passed');
process.exit(failures ? 1 : 0);
