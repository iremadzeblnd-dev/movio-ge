# Product detail loading measurements — 2026-10-14

The detail page previously awaited `select('*')` for the whole catalog before rendering. This included inline main images and every gallery array, including images belonging to other products. The initial running-demo trace took 7,962 ms to display information: the catalog request took 7,876 ms and transferred about 337 KB. JavaScript initialized in 47 ms, with no measured long tasks. A subsequent homepage request reached its existing 15-second timeout. These are network observations, not guaranteed latency.

The optimized detail page requests lightweight catalog metadata first, preserving authoritative prices, stock, categories and cart counts. It then retrieves the selected product's main image and finally its gallery. Related product main images load independently. No image data is written to Supabase. The Admin and other storefront queries retain their existing full catalog behavior.

The blocking metadata response is approximately 1.7 KB. For the measured product, subsequent main/gallery responses were approximately 69 KB and 212 KB. Three distinct GET phases replace one blocking large response; concurrent identical image requests are coalesced. OPTIONS requests in the network trace are CORS preflights, not duplicate product GETs. Inline image storage still requires downloading the complete gallery array; thumbnail lazy loading does not make those database bytes individually streamable.

## Matched browser comparison

Chrome, three navigations at each viewport, real public Supabase reads, 100 ms emulated latency and 200,000 bytes/second download throughput. Values are medians in seconds. Baseline detail HTML/JS/sync files came from gallery commit `bc0dc6e`; other assets came from the local workspace. Each measurement run used a fresh Chrome profile; the first desktop navigation was cold and later navigations reused the SDK cache. No CPU throttling was used. Remote service variability remains present.

| Viewport | Information before | Information after | Main photo before | Main photo after | Gallery controls before | Gallery controls after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop 1280px | 3.400 | 1.419 | 3.400 | 2.201 | 3.400 | 3.600 |
| Mobile 375px | 3.288 | 1.333 | 3.288 | 2.116 | 3.288 | 3.476 |

Information appears about 58–59% sooner in this controlled comparison. The gallery completes slightly later because it follows useful content rather than blocking it. The cold desktop information sample improved from 4.542 to 1.758 seconds. Unthrottled samples varied substantially; fast optimized metadata samples were around 0.2–0.3 seconds, while one metadata response exceeded two seconds. No long tasks were recorded in these runs. This does not guarantee a fixed production response time.

## Reliability and regression coverage

- Detail metadata and main-image requests have 8-second limits; gallery requests have a 12-second limit. SDK requests use AbortController where supported. The information loading UI also has an 8.5-second deadline, and a 12-second HTML watchdog provides an error panel if deferred scripts cannot initialize.
- Failed metadata shows a retryable error. Failed images preserve product information; a failed gallery preserves the loaded main image. Gallery retry reuses the main image already retrieved.
- The SDK is deferred, connections are preconnected, and the Google font stylesheet no longer blocks initialization. Main image decoding is asynchronous with high priority; thumbnails use lazy, asynchronous, low-priority loading.
- `tests/product-images.cjs` exercises real projection semantics in mocked queries, metadata/main/gallery timeouts, retries, legacy products, persistence, and desktop/mobile navigation. Its timeout cases accelerate timers in the browser; they do not wait eight or twelve real seconds.
- `node tests/product-images.cjs --saved-catalog` reads existing saved images and tests them locally without live writes.

Repeat measurements with `node tests/product-detail-performance.cjs --baseline --throttled --out=tmp/detail-before-throttled.json` and `node tests/product-detail-performance.cjs --throttled --out=tmp/detail-after-throttled.json`. This helper selects an active product through a read-only query and serves the relevant local files on a temporary localhost port. Raw Network/Performance traces are written under ignored `tmp/`. The `--baseline` option uses the current Git HEAD's detail files, so its meaning changes if a later commit includes the optimization.

No migrations, product changes, commits, pushes or deployments were performed for this optimization.
