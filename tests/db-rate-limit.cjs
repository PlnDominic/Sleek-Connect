// The rate limiter shared by every web server instance: counts in the database, only the website's server can use it.
const { URL_, KEY, admin, createClient } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const hit = (key, limit, seconds) => admin.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: seconds }).single();
const stamp = Date.now();

(async () => {
  const key = `test-${stamp}`;
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push((await hit(key, 3, 60)).data);
  assert(answers.slice(0, 3).every((a) => a.allowed), 'hits within the limit are allowed');
  assert(answers.slice(3).every((a) => !a.allowed), 'hits over the limit are refused');
  assert(answers.map((a) => a.remaining).join() === '2,1,0,0,0', `the remaining allowance counts down (${answers.map((a) => a.remaining)})`);
  assert(answers.every((a) => a.retry_after >= 1 && a.retry_after <= 60), 'and says how long to wait');
  assert((await hit(`${key}-other`, 3, 60)).data.allowed, 'another key has its own allowance');

  // Many requests at the same moment (several web server instances): exactly the limit gets through.
  const burst = await Promise.all(Array.from({ length: 40 }, () => hit(`${key}-burst`, 10, 60)));
  assert(burst.filter((r) => r.data.allowed).length === 10, 'forty simultaneous hits let exactly ten through');

  // The window passes and the allowance comes back.
  assert((await hit(`${key}-window`, 1, 1)).data.allowed && !(await hit(`${key}-window`, 1, 1)).data.allowed, 'a one-second limit refuses the second hit');
  await new Promise((r) => setTimeout(r, 1300));
  assert((await hit(`${key}-window`, 1, 1)).data.allowed, 'and allows again once the window has passed');

  // Only the website's server may use it.
  const asAnon = await anon.rpc('rate_limit_hit', { p_key: key, p_limit: 1, p_window_seconds: 60 });
  assert(asAnon.error?.code === '42501', `the public key cannot call it (${asAnon.error?.message})`);
  const table = await anon.from('rate_limits').select('key').limit(1);
  assert(table.error?.code === '42501', `or read the counts (${table.error?.message})`);
  assert((await hit('', 1, 60)).error?.code === '22023' && (await hit(key, 0, 60)).error?.code === '22023' && (await hit(key, 1, 0)).error?.code === '22023', 'bad input is refused');
  assert(typeof (await admin.rpc('purge_rate_limits')).data === 'number', 'old windows can be cleared');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll rate-limit checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
