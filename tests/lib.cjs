const path = require('path');
// Shared helpers: TOTP, staff sessions, SQL.
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const env = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SECRET = env.SUPABASE_SECRET_KEY;
const sql = (q) => execSync('docker exec -i supabase_db_Sleek-Connect psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim();

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret, offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
  return code;
}

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

async function createUser(email, password = 'correct-horse-battery', meta = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (error) throw error;
  return data.user;
}

/** Signs in with a cookie jar (like the web app). With mfa, enrolls TOTP and verifies so the session is aal2. */
async function staffSession(email, { mfa = true, password = 'correct-horse-battery' } = {}) {
  const jar = [];
  const client = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => jar,
      setAll: (cs) => cs.forEach((c) => {
        const i = jar.findIndex((j) => j.name === c.name);
        if (i >= 0) jar.splice(i, 1);
        if (c.value) jar.push({ name: c.name, value: c.value });
      }),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  let secret = null;
  if (mfa) {
    const { data: enrolled, error: e1 } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'test' });
    if (e1) throw e1;
    secret = enrolled.totp.secret;
    const { error: e2 } = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(secret) });
    if (e2) throw e2;
  }
  const cookies = () => jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' }));
  return { client, cookies, secret };
}

module.exports = { env, URL_, KEY, SECRET, sql, totp, admin, createUser, staffSession, createClient };
