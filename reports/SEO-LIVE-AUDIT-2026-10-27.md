# LeonardX Production SEO Audit — 2026-10-27

## Evidence boundary

This is a read-only independent live-site inspection using an external page-fetch service, plus repository-source inspection. It is **not** a report produced by the repaired in-repository SEO agent: that code has not been deployed, and the local runtime fetch attempt failed because the container could not resolve the production hostname. No Search Console data, PageSpeed Insights API, Lighthouse run, or browser-based visual test was performed.

## Executive summary

The sampled public pages expose page-specific titles/descriptions, canonical URLs, Open Graph metadata, Twitter cards, and `index, follow` directives. The live `robots.txt` response allows public crawling, disallows `/api/`, and advertises the sitemap. The live sitemap lists 62 URLs and did not list `/auth` or `/app`. Both `/auth` and `/app` returned `noindex, nofollow, noarchive` metadata. No AdSense publisher tag was detected in the returned head metadata or source searches; that does not establish AdSense approval or eligibility.

## Verified observations

| Severity | URL / file | Evidence | Assessment / action |
|---|---|---|---|
| Info | `/` | Title: `LeonardX — AI Website, App & Software Development`; description present; canonical `https://leoos-omega.vercel.app`; OG title/description/image and Twitter `summary_large_image` present; `robots` reports `index, follow`; one visible H1 was extracted. | Core homepage metadata is present. Canonical omits the trailing slash while the fetched final URL includes it; both are common equivalent URL forms, but choose one normalized form and ensure redirect/canonical consistency. |
| Info | `/robots.txt` | Live response body: `User-Agent: *`, `Allow: /`, `Disallow: /api/`, sitemap points to `/sitemap.xml`. | Public crawl rules are coherent; API paths are excluded. No issue confirmed from this check. |
| Info | `/sitemap.xml` | Live sitemap extraction reports 62 URLs. It includes public marketing/docs/blog routes, 20 template detail URLs and 12 project showcase URLs. `/auth` and `/app` are not listed. | Sitemap is present and has a curated public route list. Review template/project detail pages for unique, useful content and canonical/indexability before adding more URLs. Do not generate thin pages just to grow the sitemap. |
| Info | `/pricing` | Unique title `Pricing | LeonardX`, unique description, canonical, OG and Twitter metadata; `index, follow`. | Metadata coverage is good on this sampled commercial page. The extracted text begins with “Loading current prices…” before showing plan values; verify with a real browser that pricing hydrates promptly and remains crawlable without client JS. |
| Info | `/services` | Unique title and description, canonical, OG/Twitter metadata; service copy and prices are present in extracted text. | Metadata and primary content are present. Verify all CTA links and actual page rendering in browser QA. |
| Info | `/blog` | Unique title/description, canonical, OG/Twitter metadata; three article entries visible in extracted text. | Basic metadata is good. The blog listing itself is relatively short; prioritize genuinely useful article content and internal links, not keyword stuffing. |
| Info | `/projects` | Unique title/description; page says live links appear only when real deployed URLs are configured; demo entries are labelled as concepts/previews in text. | This is transparent. Ensure detail pages maintain the same distinction between live deployments and demos and do not imply unverified customer results. |
| Info | `/auth` | Live page metadata has `noindex, nofollow, noarchive`; generic site title; not in sitemap. | Correct for an authentication page. |
| Info | `/app` | Live page metadata has `noindex, nofollow, noarchive`; generic site title; not in sitemap. The extracted page displayed “No model configured” and the composer shortcuts, but this was not an authenticated functionality test. | Correct exclusion from search; the visible “No model configured” state is an app/provider UX issue, not a public SEO defect. |
| Medium | AdSense | Repository code search returned no `adsbygoogle.js` or `google-adsense-account` matches. Returned head metadata for sampled pages did not include an AdSense publisher meta tag. | AdSense integration is **not detected / unverified**. Do not add a placeholder publisher ID. If the site is approved, configure the real publisher ID in the existing root metadata/script integration and verify the required ads.txt and policy steps separately. |
| Blocked | HTTP status/redirect chain and response headers | The external extractor returned final URLs and metadata but did not provide the raw HTTP status/header set for all pages. | Recheck status codes, redirects, `X-Robots-Tag`, HSTS/CSP, cache headers and canonical redirects with an HTTP client from a network-enabled environment. |
| Blocked | Performance / Core Web Vitals | No Lighthouse/PageSpeed API run was performed. Extractor latency is not a Core Web Vitals measurement. | Run mobile and desktop PageSpeed/Lighthouse only when an authorized, configured route is available. Do not infer scores from fetch latency. |
| Blocked | Google Search Console | No authorized Search Console connector or export was available. | Indexing status, impressions, coverage and indexing requests remain unverified. |

## Source findings

- `app/layout.tsx` declares a metadata base, global title template, description, index/follow robots directives, OG/Twitter cards, and Organization/WebSite JSON-LD.
- `app/robots.ts` allows public pages, disallows `/api/`, and points to the canonical sitemap.
- `app/sitemap.ts` has an explicit public route allowlist and adds template/project detail routes.
- `lib/seo.ts` provides a shared metadata helper and noindex metadata helper.
- Repository search did not find AdSense script or publisher-meta references.

## No unsupported claims

This audit does not claim Google indexing, rankings, Search Console access, PageSpeed scores, AdSense approval, or that the repaired agent has run in production.
