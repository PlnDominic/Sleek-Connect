/**
 * Checks that a Supabase project has the schema the app expects: tables with row level security, the functions the
 * app calls, the indexes behind the busy queries, the storage buckets, and the grants that keep order secrets and
 * server-only functions away from public roles. It calls `public.verify_launch_schema()` and lists only names.
 *
 *   npm run db:verify                      # the project in apps/web/.env.local
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npm run db:verify   # any other project
 *
 * Exits with 1 when anything is missing or wrongly granted, so it can gate a release or a deploy.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// npm runs scripts from the repository root.
const envFile = resolve('apps/web/.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or fill in apps/web/.env.local).');
  process.exit(1);
}

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

async function main(url: string, key: string) {
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc('verify_launch_schema');
  if (error) {
    console.error(`Could not run the check: ${error.message}`);
    console.error('If the function is missing, run supabase/migrations/20261028100000_launch_schema_verification.sql on this project.');
    process.exit(1);
  }

  const report = data as unknown as Report;
  const sections: [string, string[]][] = [
    ['Missing tables', report.missing_tables],
    ['Tables without row level security', report.tables_without_rls],
    ['Missing functions', report.missing_functions],
    ['Missing indexes', report.missing_indexes],
    ['Missing storage buckets', report.missing_buckets],
    ['Wrong grants', report.grant_problems],
    ['Order secrets readable by public roles', report.exposed_secret_columns],
  ];
  for (const [title, names] of sections) {
    if (names.length === 0) continue;
    console.error(`${title}:`);
    for (const name of names) console.error(`  - ${name}`);
  }
  if (!report.ok) process.exit(1);
  console.log(`Schema OK at ${url}`);
}

main(url, key).catch((cause) => {
  console.error(cause);
  process.exit(1);
});
