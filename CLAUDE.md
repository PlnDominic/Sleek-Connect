# Sleek Connect – working notes

## Git

- Always commit and push to `main`. Don't create feature branches or pull requests unless asked.

## Stack and priorities

- **Web first.** `apps/web` is Next.js 16 on Node.js, backed by Supabase. Build web features before mobile ones.
- **Supabase** is the backend: Postgres with row level security, migrations in `supabase/migrations`.
- **Mobile later.** `apps/mobile` is React Native with Expo (Expo Router), targeting the App Store and Google Play.
  It is tested in **Expo Go**, so only use libraries bundled in Expo Go (install them with `npx expo install`) and keep
  the Expo SDK on the version Expo Go supports. The mobile app still reads the bundled catalogue in
  `packages/shared`; move it to Supabase when mobile work starts.
- `packages/shared` holds tokens, icons, types, the starter catalogue and the bag provider used by both apps.

## Database rules

- Change the schema only through new migrations: `npx supabase migration new <name>`, then `npm run db:reset`
  and `npm run db:types` to refresh `apps/web/src/lib/supabase/database.types.ts`.
- `supabase/seed.sql` is generated from `packages/shared/src/catalog.ts` with `npm run db:seed:generate`; don't edit it
  by hand.
- Orders are created only by the `public.place_order` function, which prices lines from the database. Never trust
  prices sent by a client.
- The web app uses the publishable key only. Never put the Supabase secret or service-role key in app code or
  `NEXT_PUBLIC_*` variables.

## Checks before pushing

```sh
npm run typecheck
npm run lint
npm run build:web        # needs Supabase env vars in apps/web/.env.local
```

Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before using unfamiliar APIs
(see `apps/web/AGENTS.md`). Expo guidance is in `apps/mobile/AGENTS.md`.
