# Google Search Console, SEO and GEO

What the site already does for search engines and AI answer engines, and the steps you do in Google's tools.

## What the site provides

- `/sitemap.xml`: every public page (home, shop, departments, categories, help, terms, privacy, each product).
- `/robots.txt`: lets crawlers read the shop and keeps the admin, bag, checkout, account and order pages out. Those pages are also `noindex`.
- Canonical links on product and shop pages (filters and pages point at the plain page, so search engines see one copy).
- schema.org data: `Organization` and `WebSite` (with a site search box) on the home page, `Product`, `Offer` and `BreadcrumbList` on each product page.
- `/llms.txt`: a plain summary of the store for AI assistants (what it sells, where it delivers, how to pay, links to categories and policies).
- Share pictures (Open Graph) for every page.

## 1. Add the site to Search Console

1. Go to <https://search.google.com/search-console> and sign in with the Google account that owns the business.
2. **Add property**, choose **Domain**, and enter `sleekconnectstore.com`. This covers `www` and any other subdomain.
3. Google shows a TXT record. Add it where the domain's DNS is managed (if the domain is on Vercel: Vercel → Domains → DNS records → add a TXT record with the value Google gave). Click **Verify** (DNS can take a few minutes).
4. Alternative if you cannot change DNS: add a **URL prefix** property for `https://www.sleekconnectstore.com`, choose the **HTML tag** method, copy only the `content` value, and set it in Vercel as `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (Production), then redeploy and click Verify.

## 2. Make one address canonical

`SITE_URL` in Vercel must be `https://www.sleekconnectstore.com` (the address you want people to find). In Vercel → Domains, make the other form (`sleekconnectstore.com`) redirect to it, so Google sees one site.

## 3. Submit the sitemap

Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**. Status should become "Success" and the discovered page count should grow over a few days.

## 4. Check key pages

Search Console → **URL inspection**: paste the home page, a category and a product, and click **Request indexing**. Do this for new products when you add them.

## 5. Check the structured data

Open <https://search.google.com/test/rich-results> and test a product URL. It should show a valid **Product** with price and availability. Fix anything marked as an error. Search Console → **Enhancements** then reports these for the whole site.

## 6. Link it to Analytics

If you use Google Analytics 4 (see `docs/SENTRY_POSTHOG.md`, the GTM section): GA4 → Admin → Product links → **Search Console links** → link this property. Search queries then show in GA4 reports.

## 7. Bing and other search engines

<https://www.bing.com/webmasters> → **Import from Google Search Console**. This also feeds several AI assistants that use Bing's index.

## Getting found by AI answers (GEO)

- Keep product pages complete: a clear name, brand, a real description, price, photos and stock. AI answers quote what is on the page.
- Keep the Help page accurate (delivery areas, fees, payment, returns). Assistants quote it.
- `/llms.txt` updates by itself when you add categories.
- Reviews and answered product questions on product pages add the detail assistants look for.
- Do not block AI crawlers in `robots.txt` if you want to be cited.

## Checks to repeat

- After big catalogue changes: Search Console → **Pages** shows how many pages are indexed and why others are not.
- Weekly for the first month: **Performance** (queries, pages, clicks) to see what people search for. Queries with no matching products are also in Admin → Catalogue → Searches.
