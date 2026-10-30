/**
 * Repeats the launch schema check (P0 items 1 and 2) against any Supabase project: it applies nothing and reads
 * only names of anything missing or wrongly granted.
 *
 *   npm run db:verify                                  # the project in apps/web/.env.local
 *   npm run db:verify -- <url> <key>                   # hosted production (SUPABASE_SECRET_KEY or the publishable key)
 *
 * Exits 1 when the schema is not the one the application expects, so it can gate a deployment.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type Report = {
  ok: boolean;
  missing_tables: string[];
  tables_without_rls: string[];
  missing_functions: string[];
  missing_indexes: string[];
  missing_buckets: string[];
  grant_problems: string[];
  exposed_secret_columns: string[];
};

const checks: [keyof Report, string][] = [
  ['missing_tables', 'tables missing'],
  ['tables_without_rls', 'tables without row level security'],
  ['missing_functions', 'functions missing'],
  ['missing_indexes', 'indexes missing'],
  ['missing_buckets', 'storage buckets missing'],
  ['grant_problems', 'function grant problems'],
  ['exposed_secret_columns', 'order secret columns readable by a public role'],
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  // npm runs scripts from the repository root.
  const envFile = resolve('apps/web/.env.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const [argUrl, argKey] = process.argv.slice(2);
  const url = argUrl || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = argKey || process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    fail(
      'A Supabase URL and key are needed.\n' +
        '  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in apps/web/.env.local,\n' +
        '  or pass them: npm run db:verify -- <url> <key>',
    );
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('verify_launch_schema');

  if (error) {
    if (error.code === 'PGRST202') {
      fail(
        'verify_launch_schema() does not exist on this project.\n' +
          'The migrations have not been applied (P0 item 1): run `npx supabase db push --include-seed`,\n' +
          'or paste supabase/setup.sql into the SQL Editor for a new project.',
      );
    }
    fail(`The schema check could not run: ${error.message}`);
  }

  const report = data as unknown as Report;
  let failed = report.ok === false;
  for (const [field, label] of checks) {
    const values = report[field] as string[];
    if (Array.isArray(values) && values.length > 0) {
      failed = true;
      console.error(`FAIL — ${label}: ${values.join(', ')}`);
    } else {
      console.log(`ok - ${label}: none`);
    }
  }
  console.log(failed ? 'SCHEMA MISMATCH' : 'schema matches the application');
  process.exit(failed ? 1 : 0);
}

void main();
