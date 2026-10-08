# MOVIO pre-deployment audit — 2026-10-08

Production checkout is **not yet certified for release**. This audit inspected the current JavaScript and every repository SQL migration. No migrations, real orders, production mutations, commits, pushes or deployments were performed. Secret values were not inspected or printed.

## A. What works and how it was verified

| Area | Finding | Evidence and limit |
| --- | --- | --- |
| Guest/authenticated checkout | Guest ownership is NULL; authenticated ownership comes from server-verified Auth, never browser user_id. Address, items, origin, payment type and Turnstile are validated. | Isolated API/HTTP and desktop/mobile browser tests. Actual customer checkout was not submitted. |
| Order persistence | Current RPC inserts orders and immutable order_items snapshots, updates inventory, and returns server totals in one transaction. | SQL source review only; PostgreSQL persistence/rollback execution was not performed. |
| Admin | Private Auth UUID allowlist; UI fails closed, clears on logout, and rejects metadata-based authorization. Listing/status RPCs independently require the allowlist. | VM/browser tests with simulated authorization and static SQL review. Live Admin authorization was not exercised. |
| Inventory | Stable product lock order, stock validation/deduction, inactive/missing product rejection. Cancellation locks the order and uses stock_restored_at plus terminal-state checks to prevent repeated restocking. | Static review of current SQL; simulated inventory/API tests. Real locking/concurrency was not exercised. |
| Shipping/totals | All 60 tariff values and inclusive boundaries match JS/SQL. Free items contribute zero chargeable weight; mixed carts charge paid weight only. Paid weight above 1000 kg blocks checkout. Product prices and shipping derive from locked DB rows; client amounts cannot set totals. | JS tariff/boundary tests and SQL source comparisons, not execution of deployed RPCs. |
| Retry safety | Unique checkout_token, transaction advisory lock and payload comparison return the same receipt for the same request. Browser double submission is guarded. | SQL review and simulated HTTP/browser receipt tests. Real concurrent database calls remain unverified. |
| Live read access | Actual Supabase scooter at 2299 GEL renders; anonymous orders/order_items reads return HTTP 401 / SQLSTATE 42501. | Read-only live requests and Chrome integration. This does not prove authenticated customer isolation or service-role/Admin grants. |

## B. Fixed in this audit

- `api/orders.js`: unknown RPC/gateway errors and HTTP 5xx now produce an uncertain 503 outcome, retaining the retry token instead of clearing it as a definitive 409 rejection.
- `script.js`, `orders.js`: pending checkout retains original items, confirmation values, purchased quantities, token and ownership. A recovery control can resend the same request after a reload or catalog disappearance. Changing accounts cannot transfer the pending checkout. PostgreSQL still validates every request and rejects unavailable items when no previous receipt exists.
- `styles.css`: expose only the recovery control in the existing mobile checkout layout; no redesign.
- `store.js`, `script.js`, `product-detail.js`: enforce the RPC's 100-per-product limit consistently, including cart counters and controls.
- `orders.js`: invalid checkout configuration is no longer cached before validation.
- Older browser test fixtures explicitly install isolated catalogs instead of depending on production reading localStorage. Physical-click tests now scroll immediately before measuring the target.
- `tests/orders-sql.cjs`: added `--static` so current SQL security/inventory/persistence assertions can run without executing migrations. Its original PostgreSQL/WASM mode remains available for separately authorized isolated testing.

Changed tests: orders-api, orders-browser, cart-quantity, customer-auth, catalog-sync and orders-sql. No SQL migration was modified.

## Test results

13 full suites passed: admin-orders, admin-security, cart-quantity, catalog-browser, catalog-live, catalog-sync, customer-auth, free-shipping-migration, orders-api, orders-browser, orders-http, product-delivery and site-readiness.

The 14th suite, `node tests/orders-sql.cjs --static`, passed static checks. Its PostgreSQL/WASM execution was **not run** because it applies migrations. All checkout/order mutations used isolated simulated services; the live catalog suite only read Supabase. Syntax checks and `git diff --check` passed.

New regressions cover an uncertain gateway response retaining the retry token, missing/deactivated products, the 100-item limit, and a simulated committed-but-lost response recovered after reload/product disappearance with the same payload/token and exactly one receipt. Recovery under another account makes no checkout request.

## C. What blocks production

1. Applied database migration history, function definitions/owners, RLS policies, table/column grants and extra privileged RPCs are not independently verified. Repository SQL is not evidence that the live schema matches it.
2. Actual orders/order_items persistence, transaction rollback, customer isolation, last-unit contention, duplicate concurrent retries and concurrent/repeated cancellation need staging database execution.
3. Live Admin allowlist membership, unauthorized write denial, authorized management and revocation during an active session remain unverified.
4. Target server environment presence, Turnstile hostname/action verification, runtime behavior, Auth redirects/email delivery and rate limits remain unverified. Default local preview intentionally disables real checkout; it is not an end-to-end production checkout test.
5. Cancellation deliberately preserves stock_status. A product that sold out can regain quantity but remain unavailable until Admin changes its status. Deactivated products stay inactive. Physically missing product rows abort cancellation/restocking; do not physically remove referenced inventory rows.
6. Retry protection is per persisted token. Clearing session storage, moving to another browser/tab, or deliberately submitting a new token is not a guarantee of one order for all user actions; uncertain orders must be reconciled before starting another checkout.

## D. Exact next steps, in order

1. A trusted project owner compares deployed migration history/schema and grants with the repository. Confirm the base orders migration before doing anything; do not blindly rerun it or named policy migrations.
2. In an isolated staging project, apply only missing migrations: product-delivery, weight-shipping-orders, admin-security, admin-orders, then nationwide-free-shipping last. Verify specifications/discount columns if absent. The base orders migration is first only in a new staging database. No production migration is authorized by this audit.
3. Authorize the intended staging Admin Auth UUID in the private allowlist. Test guest/customer denial, Admin success and revocation, own-order reads and isolation, private capability-column denial, and service-role-only checkout RPC execution.
4. Configure staging server variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, ORDER_ALLOWED_ORIGINS, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY), approved hostnames/action, Auth redirects/email and rate limits. Keep privileged values server-side. Confirm Node/runtime compatibility.
5. With explicit authorization for disposable staging orders, execute guest/auth checkout and assert orders/items snapshots, server totals, free/paid/mixed shipping, missing weight/overweight rejection, inactive/missing SKU rejection and rollback on injected failure.
6. Execute concurrent last-unit orders and same-token retries, lost-response recovery, changed-payload conflicts, repeated/concurrent cancellation, terminal-state protection and stale Admin edit conflicts. Verify exact stock changes and manual availability behavior.
7. Re-run automated/browser suites against the staging configuration, including actual Turnstile interaction and Safari/iOS. Resolve every failure and reconcile all uncertain test receipts.
8. Review the existing business-policy release checklist and obtain separate approval for production configuration/migrations and deployment only after all technical gates pass.
