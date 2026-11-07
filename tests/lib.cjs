const path = require('path');
// Shared helpers: staff sessions, SQL.
const fs = require('fs');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const env = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SECRET = env.SUPABASE_SECRET_KEY;
const sql = (q) => execSync('docker exec -i supabase_db_Sleek-Connect psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim();

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

async function createUser(email, password = 'correct-horse-battery', meta = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (error) throw error;
  return data.user;
}

/** Signs in with a password and a cookie jar, like the web app's session. Staff need nothing more than this. */
async function staffSession(email, { password = 'correct-horse-battery' } = {}) {
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
  const cookies = () => jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' }));
  return { client, cookies };
}

module.exports = { env, URL_, KEY, SECRET, sql, admin, createUser, staffSession, createClient };
