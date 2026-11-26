// Typed delivery locations: "east  legon" means "East Legon" (the database matches names exactly), and shoppers are shown the listed areas that fit.
process.env.TSX_TSCONFIG_PATH ??= require('path').resolve(__dirname, '../apps/web/tsconfig.json');
require('tsx/cjs');
const { canonicalArea, suggestAreas, quote } = require('../packages/shared/src/delivery.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

const config = {
  areas: [{ name: 'East Legon', zoneId: 'z1' }, { name: 'Legon Hills', zoneId: 'z1' }, { name: 'Madina', zoneId: 'z2' }, { name: 'Osu', zoneId: 'z2' }],
  zones: [{ id: 'z1', name: 'Zone 1' }, { id: 'z2', name: 'Zone 2' }],
  rates: [{ zoneId: 'z1', optionId: 'std', fee: 20, available: true }, { zoneId: 'z2', optionId: 'std', fee: 30, available: false }],
  options: [{ id: 'std', label: 'Standard', fee: null, freeEligible: false, daysMin: 1, daysMax: 2, cutoff: null }],
  freeThreshold: null,
  payOnDelivery: { enabled: false, maxGhs: null },
};

assert(canonicalArea(config, 'east   legon ') === 'East Legon' && canonicalArea(config, 'MADINA') === 'Madina', 'capitals and extra spaces still find the listed area');
assert(canonicalArea(config, '  Kasoa ') === 'Kasoa', 'a location that is not listed is only trimmed');
assert(quote(config, 'east legon', 'std', 100).fee === 20, 'a differently typed area gets its zone price');
assert(quote(config, 'Madina', 'std', 100).available === false, 'a zone where the option is switched off stays unavailable');
assert(quote(config, 'Kasoa', 'std', 100).fee === null, 'an unlisted area with no base fee cannot be priced');
assert(suggestAreas(config, 'leg').join() === 'Legon Hills,East Legon', 'names starting with the text come first');
assert(suggestAreas(config, 'e').length === 0 && suggestAreas(config, 'osu').length === 0, 'one letter, or an exact match, suggests nothing');
assert(suggestAreas(config, 'a').length === 0 && suggestAreas(config, 'ma').join() === 'Madina', 'two letters are enough to suggest');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll delivery area checks passed');
process.exit(failures ? 1 : 0);
