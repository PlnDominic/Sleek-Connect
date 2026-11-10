#!/usr/bin/env bash
# Runs every test suite against the local Supabase stack, each on a fresh database.
#
#   npm test                 # all suites
#   npm test -- db           # database suites only (no browser, no build)
#
# Needs: Docker with the local stack running (npm run db:start), apps/web/.env.local pointing at it (with
# SUPABASE_SECRET_KEY, ENABLE_TEST_MODES=true, PAYMENT_PROVIDER=test, PAYMENT_WEBHOOK_SECRET, SMS_PROVIDER=console, EMAIL_PROVIDER=console, PUSH_PROVIDER=console),
# and Playwright's Chromium (npx playwright install chromium). Screenshots and logs go to tests/.output.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=tests/.output
mkdir -p "$OUT"
ONLY=${1:-all}
FAILED=0

q() { docker exec supabase_db_Sleek-Connect psql -U postgres -At -c "$1" >/dev/null; }
# Resets the database and adds what the suites assume but the live store does not ship with: a few delivery areas (shoppers type their
# own location, so the seed has none) and order limits high enough that suites placing many test orders from one phone are not throttled
# (the order limits have their own suite, which sets them itself).
reset_db() {
  npx supabase db reset >/dev/null 2>&1 || { echo "database reset failed"; exit 1; }
  q "insert into public.delivery_areas (name, sort_order) values ('East Legon', 0), ('Osu', 1), ('Airport Residential', 2), ('Spintex', 3), ('Dansoman', 4)"
  q "update public.store_settings set max_open_orders_per_phone = 1000, max_orders_per_phone_per_hour = 1000, max_units_per_order = 1000"
}
fresh() {
  reset_db
  q "update public.delivery_options set fee_ghs = 30 where id = 'same_day'"
}
stop() { if command -v fuser >/dev/null; then fuser -k 3000/tcp >/dev/null 2>&1; else pkill -f "next start -p 3000" >/dev/null 2>&1; fi; true; }
start() {
  stop
  (cd apps/web && nohup npx next start -p 3000 > "../../$OUT/server.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:3000/ && return; sleep 1; done
  echo "web server didn't start"; tail -20 "$OUT/server.log"; exit 1
}
suite() {
  local name=$1 file=$2
  echo "== $name"
  if node "tests/$file" "$OUT" > "$OUT/$file.log" 2>&1; then
    tail -1 "$OUT/$file.log"
  else
    FAILED=1
    grep -E "FAIL|Error" "$OUT/$file.log" | head -20
    tail -3 "$OUT/$file.log"
  fi
}
server_errors() {
  local n
  n=$(grep -c 'Error' "$OUT/server.log" || true)
  echo "   server errors: $n"
  if [ "$n" != "0" ]; then FAILED=1; grep -m5 'Error' "$OUT/server.log"; fi
}

if [ "$ONLY" != "db" ]; then
  fresh
  # Two items sold out for the stock checks in the shop suite.
  q "update public.inventory_levels i set on_hand = 0 from public.products p where p.id = i.product_id and p.slug = 'wooden-number-puzzle'"
  q "update public.inventory_levels i set on_hand = 0 from public.products p where p.id = i.product_id and p.slug = 'gentle-baby-wash-shampoo' and i.size_code = '400'"
  stop
  npm run build:web > "$OUT/build.log" 2>&1 || { echo "BUILD FAILED"; tail -30 "$OUT/build.log"; exit 1; }
  start; suite "read-only production smoke" smoke-production.cjs; suite "shop, bag, stock, payments" e2e-shop.cjs
  fresh; start; suite "accounts and bag sync" e2e-account.cjs
  fresh; start; suite "admin console and order pages" e2e-admin.cjs; server_errors
  fresh; start; suite "shop pages, search, content, returns, help" e2e-store.cjs; server_errors
  fresh; start; suite "delivery, photos, wishlist, addresses, cancel, buy again" e2e-shopper.cjs; server_errors
  fresh; start; suite "terms, saved numbers, reviews, data export and deletion" e2e-privacy.cjs; server_errors
  fresh; start; suite "mobile app: payment prompt endpoint" e2e-mobile-api.cjs; server_errors
  stop
fi

reset_db; suite "database: orders, staff, catalogue, stock" db-admin.cjs
reset_db; suite "database: storefront, returns, support" db-store.cjs
reset_db; suite "database: addresses, photos, delivery, cancel, wishlist" db-shopper.cjs
reset_db; suite "database: saved numbers, reviews, data export and deletion" db-privacy.cjs
reset_db; suite "database: launch security, checkout and delivery hardening" db-launch.cjs
reset_db; suite "database: mobile app push notifications" db-mobile.cjs
reset_db; suite "database: launch schema verification" db-schema-verify.cjs
reset_db; suite "database: pay on delivery" db-pay-on-delivery.cjs
reset_db; suite "database: the 18+ rule at checkout" db-age-rule.cjs
reset_db; suite "database: typed delivery areas" db-free-area.cjs
reset_db; suite "database: bulk editing, reorder suggestions, size guides" db-catalogue-tools.cjs
reset_db; suite "database: account pages, and the seller side removed" db-account-extras.cjs
reset_db; suite "database: promo code management" db-promotions.cjs
reset_db; suite "database: category photos" db-category-photos.cjs
reset_db; suite "database: abandoned bag reminders" db-bag-reminders.cjs
reset_db; suite "database: searches with no results" db-search-misses.cjs
reset_db; suite "database: product actions (duplicate, delete)" db-product-actions.cjs
reset_db; suite "database: managing categories" db-categories.cjs
reset_db; suite "database: purchasing, stock counts, supplier payments, profit" db-purchasing.cjs
reset_db; suite "database: supplier register and stock receipts" db-suppliers.cjs
reset_db; suite "database: limits on placing orders, minimum app version" db-order-limits.cjs
suite "email: Gmail sender (Nodemailer)" unit-email.cjs
suite "payments: Hubtel provider" unit-hubtel.cjs
suite "privacy: what Sentry and PostHog may receive" unit-telemetry.cjs
suite "privacy: no trackers, no cookies of our own" unit-privacy-guard.cjs
suite "safety: test payment and console messages are off on the live site" unit-dev-modes.cjs
suite "security: sign-in redirects stay on this site" unit-safe-redirect.cjs
suite "build: server action files export only async functions" unit-server-actions.cjs
suite "admin: the settings page shows error reporting first" unit-admin-settings.cjs

if [ "$FAILED" = "0" ]; then echo "== all suites passed"; else echo "== some suites FAILED"; fi
exit "$FAILED"
