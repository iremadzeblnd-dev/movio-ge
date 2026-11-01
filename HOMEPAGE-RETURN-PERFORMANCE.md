# Product-detail → MOVIO logo → homepage — 2026-10-14

## Measured cause

The logo performs a normal homepage navigation. The homepage previously requested `products.select('*')`, downloading main images and complete gallery arrays before creating any cards. One unthrottled mobile return took 5.490 seconds, including 5.438 seconds for the roughly 337 KB catalog response. No long tasks were recorded. There was one catalog GET, not a duplicate GET problem; OPTIONS entries are CORS preflights. Full document navigation also reloads static assets in the local no-store server.

## Changes

- Homepage cards now use the same lightweight metadata projection as product details: about 1.7 KB for the current catalog. Prices, stock, visibility, names, categories and revisions come from a new Supabase response on each normal return. Cached catalog rows never replace a failed validation or resurrect deleted products.
- The main-image loader stores only public main images in a per-project, per-product session cache. A photo is reused only when its revision exactly matches fresh `updated_at` metadata. Changed or missing revisions force a new photo request. Cache/storage failures are optional and never block rendering. This relies on the existing product write contract updating `updated_at` when images change; manually changing images without updating that field bypasses revision invalidation.
- Near-viewport product cards request missing photos progressively through IntersectionObserver. Concurrent requests for the same product are coalesced. A photo failure leaves the product card intact. No homepage query requests gallery arrays. Product details continue retrieving their gallery separately.
- The homepage SDK is deferred, Supabase/CDN connections are preconnected, and the font stylesheet no longer blocks initialization. Normal navigation and existing history behavior are preserved.
- Admin and cart continue using their full catalog queries; product writes, checkout validation, authentication and the working detail gallery are unchanged. Homepage metadata requests have an eight-second deadline and retain the existing error/refresh behavior.

## Before/after measurements

The browser opens the real product detail page, waits for image loading to finish or reach its bounded error state, clicks the MOVIO logo, and measures until the first card price/name exists in the homepage DOM. This is card readiness, not an LCP measurement. Images below the fold are measured after the test scrolls into the catalog. The helper records CDP Network events, Performance long tasks, authoritative price/stock snapshots and repeated returns. No database writes occur.

| Measurement | Desktop 1280px | Mobile 375px |
| --- | ---: | ---: |
| Before, controlled network median | 6.384 s | 6.387 s |
| After, controlled network median | 3.255 s | 3.325 s |
| After, unthrottled median | 0.389 s | 0.313 s |

Controlled conditions: Chrome, 100 ms emulated latency, 200,000 bytes/second download, three repeats per viewport, one fresh browser profile per stage, real Supabase data. The baseline mobile median includes two successful samples; its third request timed out and is recorded as a failure rather than silently included as a zero. All six controlled after samples succeeded. The local server uses no-store for static assets, so their re-download dominates much of the remaining controlled delay. Network/service variability remains; these are observations, not guaranteed production times.

All six final unthrottled returns succeeded in 0.288–0.461 seconds. They each made exactly one homepage metadata GET and no main-image or gallery GET: revision-validated cached photos were reused. No long tasks were recorded. An earlier after run included a cold cache miss and a metadata latency outlier; the raw traces retain those observations separately where available.

Raw traces are under ignored `tmp/home-return-before.json`, `tmp/home-return-after.json`, `tmp/home-return-after-unthrottled.json` and `tmp/home-return-before-debug.json`. `tests/home-return-performance.cjs` repeats this exact path using a temporary localhost server and read-only public catalog access. `--throttled` enables the controlled network settings; `--out=...` writes measurements. `--baseline` requires the preserved pre-change files in `tmp/home-return-baseline/`; do not replace that snapshot with optimized files and call it a before measurement.

## Verification

`tests/catalog-progressive.cjs` covers metadata-first loading, photo-request coalescing, revision matching/invalidation, fresh price and stock, removed/deactivated products, failed metadata, legacy missing revisions and blocked storage. Browser regressions cover repeated desktop/mobile product/logo/category/back/forward/reload navigation, image editing and gallery timeout/retry, Admin, cart quantities, guest checkout, lost-response recovery and authentication. An existing checkout test's navigation wait was corrected to wait for its element before reading `.hidden`. Mocked gallery tests now omit external font links to avoid unrelated internet-dependent load-event timeouts.

No Supabase data changes, migrations, commits, pushes or deployments were performed.
