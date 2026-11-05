// Database checks for the "searches with no results" report: what is and isn't recorded, who can read it, and that the table is closed.
const { URL_, KEY, sql, createUser, staffSession, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const stamp = Date.now();

(async () => {
  const people = {};
  for (const [k, role] of [['cat', 'catalogue'], ['ops', 'operations']]) {
    await createUser(`${k}+${stamp}@example.com`);
    sql(`insert into public.staff_members (email, role) values ('${k}+${stamp}@example.com', '${role}')`);
    people[k] = (await staffSession(`${k}+${stamp}@example.com`)).client;
  }
  const { cat, ops } = people;
  const word = `zxq${stamp}`;

  // Guests can report a miss; it is counted by normalised words
  assert(!(await anon.rpc('record_search_miss', { p_query: `  ${word.toUpperCase()}  oil ` })).error, 'a guest can report a search that found nothing');
  await anon.rpc('record_search_miss', { p_query: `${word} oil` });
  assert(Number(sql(`select searches from public.search_misses where term = '${word} oil'`)) === 2, 'the same words are counted together, ignoring case and spacing');

  // Nothing personal is kept
  for (const q of ['me@example.com', '0241234567', 'https://evil.example', 'www.example.com', 'x', 'a'.repeat(80)]) await anon.rpc('record_search_miss', { p_query: q });
  assert(Number(sql(`select count(*) from public.search_misses where term ~ '@|\\d{5,}|http|www\\.' or length(term) < 2 or length(term) > 60`)) === 0, 'emails, long numbers, web addresses and very short or long text are not recorded');

  // The report
  assert((await anon.rpc('admin_search_misses')).error !== null, 'guests cannot read the report');
  assert((await ops.rpc('admin_search_misses')).error?.code === '42501', 'operations staff cannot read it');
  const report = await cat.rpc('admin_search_misses', { p_days: 7 });
  assert(!report.error && report.data.some((r) => r.term === `${word} oil` && Number(r.searches) === 2), 'catalogue staff see the word and how often it was searched');
  assert(!(await cat.rpc('admin_clear_search_miss', { p_term: `${word} oil` })).error, 'staff can remove a word once dealt with');
  assert(Number(sql(`select count(*) from public.search_misses where term = '${word} oil'`)) === 0, 'and it is gone');

  // The table itself is closed
  assert((await anon.from('search_misses').select('term')).error?.code === '42501', 'the table is not readable by the public');
  assert((await cat.from('search_misses').select('term')).error?.code === '42501', 'nor directly by staff, who use the report');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll search report checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
