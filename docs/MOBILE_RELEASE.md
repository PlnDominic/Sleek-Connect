# Mobile app: building, testing and submitting

`apps/mobile` is the Sleek Connect Store app for iPhone and Android. This is what has to happen between "it works in
Expo Go" and "it is in the App Store and Google Play". Things only you can do (accounts, payments, screenshots) are
marked **You**.

## What the app does today

Browse and search the live catalogue (light and dark themes, switchable in Account), bag and saved items on the phone, sign in (Google, and Apple on iPhone), checkout with
Mobile Money inside the app, order tracking, pay again or cancel before packing, push notifications for order updates,
and deleting the account from the Account tab. Returns, receipts and help open the website.

## One-time setup

1. **You:** create an [Expo account](https://expo.dev), an Apple Developer account (US$99 a year) and a Google Play
   Console account (US$25 once).
2. Install the tools and link the project (this writes `extra.eas.projectId` into `apps/mobile/app.json`, which push
   notifications need):

   ```sh
   npm install -g eas-cli
   cd apps/mobile
   eas login
   eas init
   ```

3. The app's identifier is `com.sleekconnect.store` on both stores (`ios.bundleIdentifier`, `android.package` in
   `app.json`). Change it now if you want another one; it can't be changed after the first release.
4. Give the build the same public values as `apps/mobile/.env.local` (they are safe to ship; never add the secret key):

   ```sh
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<project>.supabase.co --environment production --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <publishable key> --environment production --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SITE_URL --value https://<your live website> --environment production --visibility plaintext
   ```

   Repeat with `--environment preview` and `--environment development` for test builds.
5. Make sure the push-notification migration (`20261028090000`) is applied to the database. Don't paste that file into the SQL
   Editor: it errors if the tables already exist, and it redefines `queue_order_notifications`, `export_my_data` and
   `delete_my_account`, which later migrations replace (the old copies would break account deletion). Instead run
   `supabase db push` (applies pending migrations in order), and check with `supabase migration list --linked`.
6. On the website's host (Vercel), set `PUSH_PROVIDER=expo`. If you turn on "enhanced push security" in your Expo
   account, also set `EXPO_ACCESS_TOKEN`.
7. Supabase → Authentication → URL Configuration → Redirect URLs: add `sleekconnect://auth/callback` (needed for Google
   sign-in in a built app).
8. Phone sign-in is no longer used (Google only), so the Supabase Phone provider does not need to be on.
9. **Forcing an update.** Before a database change that would break older builds, release the new build, then raise the minimum:
   `update public.store_settings set min_app_build = <the new build number>;` (Supabase SQL Editor). Older builds then show
   "Please update the app" instead of failing. The build number is the Android version code Play shows next to the release (EAS raises it
   by one each build).

## Building and testing

```sh
eas build --profile development --platform android   # installs like an app; needed to test push on Android
eas build --profile development --platform ios      # needs an Apple Developer account and a registered iPhone
eas build --profile preview --platform all           # shareable test builds
eas build --profile production --platform all        # what you submit to the stores
```

- **Push notifications** need a real phone. Expo Go on Android can't receive them; iPhone in Expo Go and every
  development build can. EAS creates the Apple push key for you; for Android, add a Firebase (FCM v1) service account
  key under `eas credentials` once. Test by placing an order and marking it packed in the admin.
- Place a test order locally (`ENABLE_TEST_MODES=true`, `PAYMENT_PROVIDER=test`) and finish it with `npm run payments:simulate`.
- Run `npx expo-doctor` and `npm run typecheck && npm run lint` before every build.

## Before you submit

- The app icon, Android adaptive icons, notification icon and splash screen use the Sleek Connect logo (`apps/mobile/assets`).
  The Google Play 512×512 icon and the 1024×500 feature graphic are in `apps/mobile/store-assets`. If you get the logo as a
  vector file (SVG or AI), send it so the icons can be redrawn sharper.
- **Payments:** reviewers will try to check out. Connect the real payment provider (Hubtel). The test provider is for automated tests only and is
  refused on Vercel production. Physical goods are paid for outside the stores' own purchase
  systems, which both stores allow.
- **Sign-in for reviewers:** the app signs in with Google and Sign in with Apple only (no phone code). Reviewers use **Continue with Apple**
  with their own Apple ID; no demo account is needed. Ordering also works for Google sign-in testers. Mention this in the review notes.
- Fill in `BUSINESS_NAME`, `BUSINESS_ADDRESS` and the other business details on the website so the privacy notice and
  terms are complete (the stores ask for a working privacy policy URL).
- The app lets people delete their account (Account → Delete my account), which the App Store requires.

## Store listing

Use these as a starting point.

| Field | Text |
| --- | --- |
| Name | Sleek Connect Store |
| Subtitle (App Store, 30 characters) | Everything, delivered in Accra |
| Short description (Google Play, 80 characters) | Shop everyday products and get them delivered across Accra. Pay with MoMo. |
| Category | Shopping |
| Keywords | shop, store, online shopping, Accra, Ghana, delivery, mobile money, MoMo, deals, essentials |
| Support URL | `https://<your website>/help` |
| Privacy policy URL | `https://<your website>/privacy` |
| Marketing URL | `https://<your website>` |
| Age rating | Everyone / 4+. No user-generated content in the app, no web browsing, no gambling or mature content. |

**Long description**

> Sleek Connect Store is a general online store: a wide range of everyday products, delivered to your door in Accra.
>
> • Browse and search the whole range, with filters, sizes and clear stock.
> • Every product is checked for authenticity, with batch and expiry details on your receipt.
> • Pay with MTN MoMo, Telecel Cash or AT Money, approved on your phone.
> • Follow your order from packing to the rider at your door, and get a notification at each step.
> • Delivery Monday to Saturday.
>
> You don't need an account to order. Sign in with Google to see your orders on every device.

**Screenshots (You):** iPhone 6.9″ (1320×2868) and 6.5″ (1284×2778), at least three each; Android phone (1080×1920 or
larger), at least two; a 1024×500 feature graphic for Google Play. Good screens: Home, a product, the bag, checkout, and
an order being tracked.

## Privacy answers

**App Store "App Privacy"** (everything below is *used for app functionality*, *linked to the user*, *not used for
tracking*):

| Data type | Collected | Why |
| --- | --- | --- |
| Contact info: name, phone number, email address (Google sign-in), physical address | Yes | Orders, delivery, sign-in |
| Purchases: order history | Yes | Orders, tracking, refunds |
| Financial info: Mobile Money network and number | Yes | Payment (the PIN is entered on the phone's own prompt and never reaches us) |
| Identifiers: device ID (push token) | Yes, if notifications are allowed | Order notifications |
| Location, contacts, photos, browsing history, health, diagnostics | No | |

**Google Play "Data safety":** the same data types (personal info: name, email, phone, address; financial info: payment
info; device or other IDs); collected, **not shared** with third parties for their own use (the payment, SMS and push
providers act for us); encrypted in transit: yes; users can ask for deletion: yes, in the app and at
`https://<your website>/account/privacy`.

## Things to know

- Order and promo prices are always worked out by the database; the app only sends product, size and quantity.
- The sign-in session is stored in the app's private storage on the phone (not in the cloud). Signing out removes it.
- Deleting an account in the app removes the same data as on the website. A shopper's reviews can stay visible on product
  pages for a few minutes afterwards, until the catalogue cache refreshes.
- Bumping versions: `appVersionSource` is `remote` and production builds auto-increment the build number; change
  `version` in `app.json` for a new public release.

## Submission checklist, in order

1. **You:** run `eas init` in `apps/mobile` (writes the project id), then set the three `EXPO_PUBLIC_*` values for the `production`
   environment (see "One-time setup"). Use the live website address, and the Supabase custom domain once you have one.
2. `npm run typecheck && npm run lint && npx expo-doctor` from `apps/mobile`. `expo-doctor` may list a few packages a patch version behind
   the SDK; `npx expo install --fix` aligns them. Test in Expo Go afterwards.
3. `eas build --profile preview --platform all`, install it on a real iPhone and Android phone, and walk through: browse, add to bag,
   sign in, checkout with a real GH₵1 payment, track the order, receive the push notification, switch theme, delete a test account.
4. **You:** App Store Connect: create the app (bundle id `com.sleekconnect.store`), copy its numeric Apple ID into
   `submit.production.ios.ascAppId` in `eas.json`. Google Play Console: create the app (package `com.sleekconnect.store`).
5. `eas build --profile production --platform all`, then `eas submit --profile production --platform ios` and `--platform android`
   (Android goes to the internal testing track first, as a draft).
6. **You:** upload screenshots (taken once the shop has real products; use the iPhone 6.9″ and a 1080×1920 Android size), paste the listing text above, and
   upload `store-assets/play-icon-512.png` and `store-assets/play-feature-graphic-1024x500.png` to Google Play.

### App Store review notes (paste into "Notes")

> Sleek Connect Store is a general online store selling a wide range of products, delivered in Accra, Ghana. You can browse and order without an account.
> To sign in, tap Account, accept the terms, and use "Continue with Apple" with any Apple ID (no demo account is needed). Payment is by Mobile Money
> prompt; physical goods are paid for outside In-App Purchase, as the guidelines allow. Account deletion: Account → Delete my account.
> Privacy policy: https://sleekconnectstore.com/privacy


### Google Play Console answers

- **App access:** "All or some functionality is restricted": checkout needs a Google account; give Play a test Google account (the store owner can create one).
- **Ads:** no ads. **Target audience:** 18 and over (checkout asks shoppers to confirm they are 18 or older).
- **Content rating:** answer the questionnaire honestly: no violence, no user-generated content, no gambling; it is a shopping app.
- **Data safety:** as in "Privacy answers" above. **Account deletion URL:** `https://sleekconnectstore.com/account/privacy` (needs sign-in) plus the in-app Delete my account.
- **Financial features:** none (payments go through Hubtel; the app is not a bank, loan or investment product).
- **News, health, government declarations:** not applicable.

## Sign in with Apple (App Store guideline 4.8)

The app offers Google, so the App Store requires an equivalent option: the iPhone app shows **Continue with Apple** next to Google.
**You:** (1) developer.apple.com → Identifiers → `com.sleekconnect.store` → tick **Sign in with Apple** and save (EAS picks the capability up
on the next build). (2) Supabase → Authentication → Providers → **Apple**: turn it on and add `com.sleekconnect.store` under *Authorized Client IDs*
(the native app needs no secret key). (3) **Account deletion** also revokes the Apple link, as App Store guideline 5.1.1(v) requires: right after an Apple
sign-in the app sends Apple's authorization code to the website (`POST /api/account/apple-link`), which exchanges it for a refresh token and stores it
(`apple_sign_in_tokens`, no direct access); deleting the account first calls `POST /api/account/apple-revoke`, which revokes it at Apple. **You:** at
developer.apple.com → Keys, create a key with **Sign in with Apple** enabled (download the `.p8` once), then set `APPLE_TEAM_ID` (Membership page),
`APPLE_KEY_ID` (the key's id) and `APPLE_PRIVATE_KEY` (the `.p8` text, line breaks written as `
`) on Vercel. Without them the step is skipped
(and Apple will see the link still active, so set them before submitting). Run `supabase db push` for migration `20261203090000`.
