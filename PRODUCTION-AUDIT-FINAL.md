# MOVIO comprehensive production audit — 2026-10-08

The remaining launch checklist has been superseded by [LAUNCH-PREPARATION.md](LAUNCH-PREPARATION.md). It identifies the old deployed revision causing the API 404, records the focused build/tests and prepares isolated staging. Previously completed production SQL/product-policy checks are accepted; the older metadata-recheck request below is historical and is no longer required.

Local audit and fixes are complete. Production is **not cleared for launch**. No live data changes, production migrations, commits, pushes or deployments were performed. SQL execution was limited to fresh disposable local PostgreSQL-compatible databases. External checks were read-only. Secret values were not retrieved or printed.

**Latest follow-up:** the owner supplied live read-only product-policy and Admin-allowlist findings. Product-policy review is resolved on that evidence, as recorded below. This follow-up executed **no SQL or migrations**, made no production changes, and did not commit, push or deploy. No additional application defect was confirmed; existing local fixes remain uncommitted.

## Live product-policy findings supplied by the owner

- Five policies exist on `public.products`.
- Public SELECT is allowed for `anon` and `authenticated`.
- INSERT, UPDATE and DELETE are restricted through `movio_is_admin()`.
- The private `admin_users` table contains one Admin; authenticated users cannot directly modify that table.

These findings resolve the three reported product RLS REVIEW warnings. They are owner-reported live diagnostic evidence, not an independently executed policy query in this follow-up. No policy change or migration is indicated by these findings. Public catalog SELECT is intentional; purchase availability remains independently enforced by checkout. The generic SQL checker can continue returning REVIEW for public catalog predicates; that is not a new failure or a reason to remove public reads.

One allowlist row does not establish that it belongs to the intended operator, verify the deployed `movio_is_admin()` body/grants, or certify Admin order RPCs. Orders RLS, RPC permissions, migration compatibility and real runtime verification remain separate gates. The earlier 227 PASS / 5 REVIEW result is not being recalculated from a policy summary.

## Completed work

Reviewed storefront/catalog caching, customer authentication and recovery, guest/authenticated checkout, the order API, Admin authorization and product/order management, inventory, shipping, customer order history, all SQL files, deployment exclusions and existing release documents.

Confirmed code fixes:

- `store.js` and `script.js`: share canonical category mapping for Georgian labels and English keys. Storefront and Admin now agree on category identity.
- `admin.js`: category filtering and edit-form selection recognize existing Georgian categories, preventing an incorrect default category on edit.
- `product-detail.js`: unavailable catalog shows an error instead of a false product-not-found result; numeric/string cart IDs and quantities count correctly; related products use canonical categories.
- `supabaseClient.js`: missing or failing SDK initialization fails closed without an uncaught initialization exception, fake authentication or catalog fallback.
- `tests/orders-browser.cjs`: regression coverage for Admin category filtering/editing, legacy cart IDs and product-detail catalog failure.
- `tests/current-orders-sql.cjs`: added transactional rollback, customer mutation/isolation denial and service-role retry coverage after product deactivation.
- `tests/runtime-guards.cjs`: added SDK initialization and category-alias regressions.
- `supabase-product-policy-diagnostic.sql`: prepared a SELECT-only product policy diagnostic, including ALL policies, roles, permissive/restrictive mode and both expressions. The owner has now supplied live diagnostic findings; this agent did not execute it against production.

Existing checkout uncertainty handling, payment behavior, shipping tariffs, design and cancellation semantics were preserved. These code fixes require no new database migration.

## Verification and its limits

| Area | Verified locally or read-only | Still requires staging/owner verification |
| --- | --- | --- |
| Catalog | Live Supabase SELECT/SDK returned the active Georgian scooter at 2299 GEL, stock 4. No stale localStorage fallback; loading/error/empty states and deleted-product protection pass. | Deployed application configuration and catalog behavior after release. |
| Customer authentication | Real SDK with intercepted service responses: signup, login, logout, recovery, persistence and history isolation. | Actual email delivery, confirmation/recovery redirects and two real test accounts. |
| Guest/authenticated checkout | API guest path and verified customer identity, receipt validation and errors pass. Disposable SQL persists orders/items. | Real API-to-Supabase requests in an isolated staging project. |
| Turnstile | Server uses secret for Siteverify; checks strict success, expected hostname/action; rejects failed or malformed verification. Site key is public; secret remains server-side. | Real challenge, approved hostname, matching keys and deployed server verification. |
| Idempotency | Original token/payload survive uncertain responses and later 401/403/409. API malformed receipts produce 503. SQL retries return existing receipts without another deduction. | Concurrent requests and lost-response retry across real connections. |
| Prices/delivery/payment | Database-derived product prices and shipping totals; tampering rejected; all 60 tariffs and free/paid/mixed delivery scenarios pass. Existing payment method preserved. | Staging receipts and owner-approved fulfillment behavior. No bank integration was invented. |
| Inventory | Locked stock deductions, unavailable/deleted product denial, injected failure rollback and cancellation restoration once pass in disposable SQL. | Concurrent last-unit purchases, cancellation races and stale Admin edits against actual Postgres connections. |
| Admin/customer isolation | Local migration-chain tests previously passed. Owner now confirms five product policies, public catalog reads, Admin-only product writes and one protected Admin-allowlist row. Fresh anonymous zero-row order/item SELECT requests are denied. | Actual order policies/grants, function bodies, intended Admin UUID identity and authenticated customer isolation. |
| Layout/pages | Chrome browser tests across 320, 390, 600, 601, 768 and 1280px; Georgian text, checkout errors, local links/pages and production/mock separation checked. | Actual Turnstile widget and Safari/iOS; owner approval of incomplete business policies. |
| Deployment | Local Vercel production build succeeds; API packaged as Node 24 function, 35 static files, no API source served as static or excluded sensitive/test/backup assets. | Live `/api/orders` currently returns 404. Correct actual environment values and deployed runtime behavior remain unverified. |

## Tests

**19 suites passed; zero unresolved test failures.** Suites: admin-orders, admin-security, cart-quantity, catalog-browser, catalog-live, catalog-sync, checkout-retry, current-orders-sql, customer-auth, deployment-security, free-shipping-migration, orders-api, orders-browser, orders-http, orders-sql, product-delivery, production-check, runtime-guards and site-readiness.

That 19-suite result belongs to the preceding comprehensive audit. **Latest follow-up: 18 suites passed, zero unresolved failures, one suite deliberately skipped.** `orders-sql.cjs` and `production-check.cjs` passed in `--static` mode; `current-orders-sql.cjs` was not run because it executes migrations, which are prohibited in this follow-up. Five browser suites initially could not launch Chrome inside the sandbox; all five passed when rerun outside it. No SQL was executed. Fresh live read-only catalog verification again returned the 2299 GEL scooter with UTF-8, working category filtering and no browser errors. These results do not replace staging verification.

The initial full run exposed a premature wait in the newly added browser assertion. The wait was corrected to observe rendered detail state, then the complete affected browser suite passed. The expanded current SQL suite also passed. JavaScript syntax and diff whitespace checks passed. Tracked files and newly added code/query files were scanned for privileged credential patterns without findings.

Original and current SQL chains ran only in fresh in-memory PGlite instances. Those tests verify SQL behavior, not multi-connection concurrency or applied production history. Browser/API mocks and intercepted Auth responses are not real production orders or authentication. The live catalog check was read-only.

To repeat this follow-up without executing SQL or migrations (the local catalog preview must be available on port 4173):

```powershell
Get-ChildItem tests/*.cjs | ForEach-Object {
  if ($_.Name -eq 'current-orders-sql.cjs') { return }
  if ($_.Name -in 'orders-sql.cjs','production-check.cjs') {
    node $_.FullName --static
  } else { node $_.FullName }
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
```

## External configuration observations

The linked Vercel project is `giorgi11/movio-ge`, root `.`, framework Other, Node 24.x. All six Production variable names exist: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, ORDER_ALLOWED_ORIGINS, TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.

Vercel refused to pull their Secret values and supplied placeholders for the local build. Presence/build success therefore does not verify their values. Generated `.vercel` files are ignored and must not be committed or treated as a verified prebuilt deployment.

Latest read-only GET of `https://movio-ge.vercel.app/api/orders` still returned 404. Fresh anonymous order/order-item SELECT requests with `limit=0` were denied (401), without reading or printing records. Anonymous REST schema inspection was previously denied: it cannot establish RPC permissions or complete deployed policy definitions. Vercel variable names and Node 24/root/framework settings were reconfirmed; no values were pulled. The CLI lists the six variables for Production only, so an isolated staging/Preview environment needs its own explicitly configured values.

## Consolidated checklist requiring owner involvement — exact order

1. **Provide the remaining read-only database results.** Run `supabase-production-check.sql` as a trusted owner in SQL Editor; send the FAIL/REVIEW rows and order/Admin PASS rows, without credentials, customer records or Admin identity details. Product policy findings are already accepted; do not change or rerun product policies solely to remove generic REVIEW labels. Verify RLS enabled on orders/items; own-order SELECT predicates; no browser order mutations; hidden checkout_token/request_payload; no PUBLIC/anon/authenticated checkout execution. Both checkout overloads must be service-role-only and the old five-argument body must reject use. Admin listing/status RPCs must authorize inside PostgreSQL, PUBLIC/anon execution must be revoked, and `movio_is_admin()` must use the protected UUID allowlist with safe definer/search_path. Review body compatibility, totals/stock constraints, indexes, custom functions/views/triggers and all remaining metadata warnings.
2. **Confirm the intended Admin and configuration privately.** Match the one allowlisted UUID to the intended operator in Supabase Dashboard; do not send it here. In Vercel Dashboard verify all six actual values, matching Supabase project/keys and exact `ORDER_ALLOWED_ORIGINS`. In Cloudflare verify the site/secret pair belongs to the real widget and approved hostname, with action `checkout`; do not use test keys for production. Site key is public; service-role and Turnstile secret keys stay server-side. Confirm Auth email delivery, redirect URLs and platform rate limits. Presence of names does not establish correctness.
3. **Create and configure isolated staging before any real checkout tests.** Use a separate Supabase project and disposable accounts/products, plus a separate Vercel staging project or scoped Preview configuration. Explicitly change the staging frontend's public URL/key in its isolated copy of `supabaseClient.js` as well as the server variables; configuring only the server would leave the browser connected to production. Do not change the production frontend configuration for staging. Install only owner-reviewed required schema effects in that isolated project under separate authorization. Never blindly rerun production `supabase-orders.sql`. Required replacement order remains product-delivery, weight-shipping, Admin-security, Admin-orders, nationwide-free-shipping last; verify specifications/discount too. Diagnose production incompatibilities before preparing any specific production change.
4. **Publish the candidate only to authorized isolated staging and verify the API route.** The live production 404 is a blocker, not a code-level RPC failure. The local build already packages `api/orders.js` as a Node 24 function. A staging GET `/api/orders` must return 200 with only public siteKey/deliveryRule and no secrets; confirm the deployed revision contains the handler, root is `.`, and it is a Vercel function deployment rather than static-only hosting. Do not use the previous placeholder-based local build as a prebuilt release. No deployment is authorized or performed by this audit.
5. **Complete real staging acceptance tests.** Verify real Turnstile success/failure/expired tokens and hostname/action rejection; guest and authenticated orders/items persisted once; original checkout token/payload survive a lost response and later 401/403/409; two customers cannot read each other's or guest orders, mutate orders, or invoke privileged checkout directly. Verify authorized Admin listing/status/product writes and denial for ordinary/revoked accounts; authoritative prices and free/paid/mixed totals; concurrent last-unit checkout, transactional rollback, duplicate requests, repeated/concurrent cancellation, stock restoration once and unavailable products blocked. Check signup/recovery emails and mobile/Safari. Use only staging fixtures; do not create production orders to test these gates.
6. **Complete owner policies and authorize release separately after all gates pass.** Supply/approve seller identity/address/hours, delivery timeframes, returns/warranty/refund terms, privacy controller/retention/rights and sales terms. Review the uncommitted local fixes and exclusions. Only a subsequent explicit authorization may commit/push/deploy; then verify the deployed revision, API route, headers and real catalog. Production is not ready while the order API remains 404 or any database/configuration/staging gate is unresolved.

Local fixes remain uncommitted. No production readiness claim is made.
