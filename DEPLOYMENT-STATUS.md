# MOVIO release gate — 2026-10-08

Release execution is now explicitly authorized using the existing projects. The owner reports all six Vercel Production variables saved. The reviewed candidate will be committed/pushed only after fresh nonmigration tests and the production build pass; the new Git revision and live API will then be verified. Separate-project staging helpers are excluded from Git while retained locally. Deployment results will be reported after verification; the audit snapshots below predate this authorization.

Latest focused launch preparation: [LAUNCH-PREPARATION.md](LAUNCH-PREPARATION.md). Read-only Vercel metadata identifies the live deployment as a redeploy of `0bdabbd`, which lacks both `api/orders.js` and `vercel.json`. The current candidate builds the API correctly as a Node 24 function. 14 relevant suites and the local production build pass. No deployment occurred; current revision deployment, real configuration and isolated staging acceptance remain required. Earlier snapshots below are historical.

Current comprehensive results: [PRODUCTION-AUDIT-FINAL.md](PRODUCTION-AUDIT-FINAL.md). All 19 local suites and local Vercel build pass. Both Turnstile variable names exist, but their actual Secret values and production runtime behavior remain unverified. The live order API returns 404. The notes below describe the earlier release inspection; current fixes remain uncommitted.

Latest read-only follow-up: product-policy reviews are resolved from the owner's live findings. The API still returns 404; all six Production variable names were reconfirmed without values. 18 suites passed (two SQL checks static-only), one migration-executing suite skipped; no SQL/migrations, production changes or deployment performed. Order permissions, real configuration and isolated staging remain open.

**BLOCKED: no commit, push, deployment, production SQL execution, or production order was performed.**

## Verified against external services

- Vercel project `giorgi11/movio-ge` is accessible and linked to this workspace.
- Production environment variable names present: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_ALLOWED_ORIGINS`. Values were not retrieved or printed; correctness is not certified by their presence.
- **Missing Production variables: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.** Current `api/orders.js` requires both and responds 503 when configuration is incomplete.
- Existing production deployment is Ready: `https://movio-qe4ho4km1-giorgi11.vercel.app`; stable alias `https://movio-ge.vercel.app`. Ready describes the previous deployment, not the current workspace.
- Stable alias homepage returns HTTP 200; `/api/orders` returns HTTP 404. The current checkout handler is not available on the existing live deployment.
- Anonymous read of the actual Supabase catalog returns the active electric scooter at 2299 GEL, stock 4, weight 30 kg and free delivery enabled. Local Chrome renders this real catalog with UTF-8 Georgian text, working category filters and no console/network errors.
- Anonymous reads of orders and order_items are denied (HTTP 401, SQLSTATE 42501). This does not certify authenticated isolation, Admin privileges or deployed function bodies.

## Local verification

All **16 automated suites passed**: the 15 existing suites and new `tests/current-orders-sql.cjs`.

- Browser fixtures cover 320–1280 px layouts, Georgian text, guest/authenticated flows, Admin UI, shipping, retry recovery, unavailable products and cart behavior. Checkout/Auth services in these tests are simulated.
- `tests/catalog-live.cjs` reads actual Supabase products without mutations.
- `tests/orders-sql.cjs` now also ran its full isolated PostgreSQL/WASM mode, covering the original order migration. Earlier audit statements saying SQL was skipped describe the earlier audit only.
- New `tests/current-orders-sql.cjs` applies all six current order/shipping/Admin migrations in a disposable in-memory PostgreSQL engine. It verifies guest/authenticated persistence, item snapshots, server-derived totals, free delivery with unknown weight, mixed paid-weight shipping, retry receipt identity, payload conflicts, stock rollback, inactive/missing product rejection, disabled legacy RPC, customer RLS, restricted RPC/column permissions, Admin authorization, cancellation and exactly-once restoration without reactivating a removed product.
- Single-engine tests do not prove multi-connection PostgreSQL locking/concurrency or deployed Supabase behavior.
- `tests/production-check.cjs` validates the metadata-only verification query, current function fingerprints and missing-object handling in isolated PostgreSQL.
- `git diff --check` passed. `.gitignore` now excludes environment files, dependencies, backups, browser profiles, logs and test artifacts; `.vercelignore` excludes local test/dev servers and SQL/docs from hosting.

## Remaining release blockers and shortest ordered steps

1. Configure a real Cloudflare Turnstile widget for the intended production hostname(s). In Vercel Project Settings → Environment Variables, add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for Production. Use the dashboard; do not send secret values in chat. Confirm checkout action `checkout` and that `ORDER_ALLOWED_ORIGINS` includes the exact intended HTTPS origin(s).
2. Run `supabase-production-check.sql` in the Supabase SQL Editor under the database owner. Resolve every FAIL and assess every REVIEW; supply metadata results without customer records or secrets. Reconcile missing migrations using the order in `PRODUCTION-READINESS.md`; never blindly rerun the base orders migration, and apply nationwide-free-shipping last. Confirm the intended existing Auth UUID is allowlisted and that extra grants/policies/definer functions are safe. No live migration completeness claim is currently possible.
3. Validate real guest and authenticated checkout in staging with production-equivalent configuration. Verify persisted orders/items in authorized Admin, last-unit concurrency, same-token retries, cancellation/restoration, customer isolation and allowlist revocation. Configure and test signup/recovery redirects, email delivery, Turnstile and rate limits. No actual checkout/Auth lifecycle has been certified here.
4. Supply/approve the missing seller, delivery, returns/warranty, privacy and sales terms already identified in `PRODUCTION-READINESS.md`; current information pages explicitly disclose incomplete terms. Do not invent business policy.
5. After these gates pass, rerun the suites and production-equivalent smoke checks. Commit only reviewed relevant project sources/tests/docs, push `origin/main`, then confirm the resulting Vercel deployment and live catalog/API. The user's conditional deployment authorization remains applicable; no additional confirmation is needed solely for commit/push once all gates pass.

Current repository HEAD (unchanged): `0bdabbde8b2bd3186409d3c0b8d99da16e506720`. No new release commit exists.
