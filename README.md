# Sleek Connect

Storefront for authentic beauty products and safe, age-appropriate kids' products, delivered across Accra.
Business and product requirements live in [`docs/`](docs/) (BRD and PRD, v0.1 drafts).

This repo implements the **Sleek Connect Storefront** design handoff: three web screens and five mobile app screens.

| Workspace | What it is | Screens from the design |
| --- | --- | --- |
| [`apps/web`](apps/web) | Next.js 16 storefront (App Router, CSS Modules) | Home · Product detail · Checkout |
| [`apps/mobile`](apps/mobile) | Expo SDK 57 app (Expo Router) for Android and iOS | Home · Shop by age · Product · Mobile Money checkout · Order tracking |
| [`packages/shared`](packages/shared) | Design tokens, catalogue, icons, photos and bag state used by both apps | n/a |

## Getting started

Requires Node 20+ and npm.

```sh
npm install            # installs every workspace
npm run dev:web        # web storefront on http://localhost:3000
npm run dev:mobile     # Expo dev server; press i / a / w for iOS, Android or web
```

Checks run across all workspaces:

```sh
npm run typecheck
npm run lint
npm run build:web
```

For the mobile app, `npx expo-doctor` (inside `apps/mobile`) checks native dependency health, and
`npx expo export --platform web` produces a static web build you can preview in a browser.

## How it fits together

- **Tokens** (`packages/shared/src/tokens.ts`): colours, radii and shadows from the design. The web app exposes them as
  CSS custom properties (`--c-accent`, `--r-xl`, …); the mobile app reads them directly.
- **Catalogue** (`packages/shared/src/catalog.ts`): products, categories, age bands and the home-page collections.
  Products without a photo render a tinted placeholder with a simple product-shape icon.
- **Icons** (`packages/shared/src/icons.ts`): the design's inline SVG icons as data, drawn with `<svg>` on the web and
  `react-native-svg` on mobile.
- **Bag** (`@sleek/shared/bag`): an in-memory bag shared by both apps. It starts with the two items shown in the
  design's checkout.

## Placeholders still to fill in

The design leaves values the business hasn't set yet (the BRD and PRD mark them "To be set") as bracketed text such as
`[X]`, `[fee]` or `[Reg. number]`. They all live in `packages/shared/src/store.ts`:

- `pending`: free-delivery threshold, sale percentage, delivery days and cut-off times, return window, FDA
  registration, batch and expiry text, ingredient list.
- `deliveryFees`: set a number and the checkout totals are calculated instead of showing `[fee]` / `[total]`.
- `sampleCustomer`, `sampleBag`, `sampleOrder`: stand-ins for account, cart and order data until there is a backend.

## Not built yet

- **Backend:** no API, accounts, cart persistence, search results or order history.
- **Payments:** "Pay with MoMo" shows the designed "Check your phone" approval step, but no payment provider is
  connected. Card payment shows a "coming soon" message.
- **Pages the design doesn't cover:** listing, category, help and policy pages, plus the app's Shop, Saved and Account
  tabs. Links to them are placeholders, Shop lists the whole catalogue, and Saved and Account show simple empty states.
- **Photos:** the handoff included seven photos (in `packages/shared/assets/images`). Other products and categories use
  placeholders until real product photography is added. The "texture view" thumbnail on the baby-wash page reuses the
  shea butter photo, as in the design.
- **App icons:** `apps/mobile/assets` and `apps/web/src/app/favicon.ico` are still the framework defaults.
