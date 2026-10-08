# MOVIO clean deployment inventory

The release files and cleanup are staged for review; no commit, push, deployment, SQL execution or production data change was performed. This inventory supersedes the earlier release snapshots for current Git preparation status.

## Git cleanup

- 681 browser-profile files and 31 backup files removed from the index using --cached.
- Also untracked .iphone-check.mjs, preview-desktop.png and preview-mobile.png.
- All 715 local copies verified present; no application, SQL migration or test file was removed.
- These 715 removals and all application/configuration/test/migration/documentation files listed below are staged.
- .gitignore and .vercelignore exclude browser profiles, backups, environment/credential files and temporary artifacts.

## Existing files included in the staged release

- `.gitignore`
- `README.md`
- `admin-auth.js`
- `admin.html`
- `admin.js`
- `cart.html`
- `customer-auth.js`
- `index.html`
- `item.html`
- `mobile-storefront.js`
- `product-detail.js`
- `script.js`
- `store.js`
- `styles.css`
- `supabase-sync.js`
- `tests/cart-quantity.cjs`

## New files included in the staged release

- `.vercelignore`
- `ADMIN-ORDERS.md`
- `CUSTOMER-AUTH.md`
- `DEPLOYMENT-STATUS.md`
- `FREE-SHIPPING.md`
- `ORDERS.md`
- `PREDEPLOYMENT-AUDIT.md`
- `PRELAUNCH.md`
- `PRODUCTION-READINESS.md`
- `api/orders.js`
- `contact.html`
- `customer-account.css`
- `delivery.html`
- `information.css`
- `orders.js`
- `privacy.html`
- `returns.html`
- `scripts/dev-server.cjs`
- `shipping.js`
- `supabase-admin-orders.sql`
- `supabase-admin-security.sql`
- `supabase-nationwide-free-shipping.sql`
- `supabase-orders.sql`
- `supabase-product-delivery.sql`
- `supabase-production-check.sql`
- `supabase-weight-shipping-orders.sql`
- `terms.html`
- `tests/admin-orders.cjs`
- `tests/admin-security.cjs`
- `tests/catalog-browser.cjs`
- `tests/catalog-live.cjs`
- `tests/catalog-sync.cjs`
- `tests/checkout-retry.cjs`
- `tests/current-orders-sql.cjs`
- `tests/customer-auth.cjs`
- `tests/deployment-security.cjs`
- `tests/free-shipping-migration.cjs`
- `tests/orders-api.cjs`
- `tests/orders-browser.cjs`
- `tests/orders-http.cjs`
- `tests/orders-sql.cjs`
- `tests/product-delivery.cjs`
- `tests/production-check.cjs`
- `tests/site-readiness.cjs`
- `vercel.json`
- `CLEAN-DEPLOYMENT.md` (this inventory)

SQL migrations, tests, local development scripts and documentation remain repository files; .vercelignore excludes them from the hosted deployment. The application, API, pages, styles, assets and vercel.json must be included in the deployment.

## Verification

- Credential scans cover the complete staged Git index; public-source credential checks also pass. The Supabase publishable key is expected public configuration.
- All 16 applicable local suites/checks passed, including guest checkout, Admin guards, retry recovery and deployment file checks.
- SQL suites ran only static checks; migration-executing tests and live-service tests were excluded.
- Working-tree and staged whitespace checks passed.

## Remaining release steps and blockers

1. Review the complete staged release. Do not include ignored local artifacts or secrets. Safe Git preparation does not certify production runtime readiness.
2. Have the database owner resolve the product-policy REVIEW rows and verify actual Admin allowlisting and deployed RPC/RLS contracts. Do not blindly reapply migrations.
3. Verify matching non-test Turnstile keys, production hostnames and exact allowed origins; environment variable presence alone does not validate their values.
4. Deploy to staging only with separate release authorization; verify guest/authenticated persistence, Admin isolation, same-token retries, concurrent stock handling and cancellation/restocking.
5. The last live check returned HTTP 404 for /api/orders. Include api/orders.js and verify GET /api/orders returns the expected public configuration after the reviewed deployment.
6. Commit/push/deploy only after the release gates pass and the user authorizes those actions.
