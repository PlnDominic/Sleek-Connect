// Sign in with Apple account deletion: the refresh token needed to revoke the Apple link is kept per shopper, never readable by anyone.
const { URL_, KEY, admin, createUser, createClient, sql } = require('./lib.cjs');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };
const stamp = Date.now();

async function signedIn(email) {
  const user = await createUser(email);
  const client = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: 'correct-horse-battery' });
  if (error) throw error;
  return { id: user.id ?? user.user?.id, client };
}

(async () => {
  const a = await signedIn(`apple-a-${stamp}@example.test`);
  const b = await signedIn(`apple-b-${stamp}@example.test`);
  const anon = createClient(URL_, KEY, { auth: { persistSession: false } });

  assert(!(await a.client.rpc('save_apple_refresh_token', { p_token: 'refresh-token-for-a' })).error, 'a signed-in shopper can store their Apple token');
  assert((await a.client.rpc('take_apple_refresh_token')).data === 'refresh-token-for-a', 'and take it back');
  assert((await a.client.rpc('take_apple_refresh_token')).data === null, 'taking it removes it');

  await a.client.rpc('save_apple_refresh_token', { p_token: 'refresh-token-for-a' });
  await b.client.rpc('save_apple_refresh_token', { p_token: 'refresh-token-for-b' });
  assert((await b.client.rpc('take_apple_refresh_token')).data === 'refresh-token-for-b', 'each shopper only ever gets their own token');
  await a.client.rpc('save_apple_refresh_token', { p_token: 'newer-token-for-a' });
  assert((await a.client.rpc('take_apple_refresh_token')).data === 'newer-token-for-a', 'saving again replaces the old token');

  assert((await anon.rpc('save_apple_refresh_token', { p_token: 'x'.repeat(20) })).error?.code === '42501', 'the public key cannot store a token');
  assert((await anon.rpc('take_apple_refresh_token')).error?.code === '42501', 'or take one');
  assert((await a.client.from('apple_sign_in_tokens').select('*')).error?.code === '42501', 'nobody can read the table directly');
  assert((await a.client.rpc('save_apple_refresh_token', { p_token: 'short' })).error != null, 'a nonsense token is refused');

  // The token goes away with the account.
  await a.client.rpc('save_apple_refresh_token', { p_token: 'refresh-token-for-a' });
  await admin.auth.admin.deleteUser(a.id);
  assert(sql(`select count(*) from public.apple_sign_in_tokens where user_id = '${a.id}'`) === '0', 'deleting the account removes the stored token');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Apple revocation checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
