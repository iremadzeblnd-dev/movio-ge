# MOVIO weight-based checkout

Do NOT rerun the already applied supabase-orders.sql.
Manually review and apply these migrations in order:
1. supabase-product-delivery.sql: replaces the unexecuted fixed-fee migration; adds weight_kg and free_delivery. Legacy weights remain NULL; missing weights block ordering. Enter positive product weights in Admin.
2. supabase-weight-shipping-orders.sql: adds shipping snapshots and the authoritative weight-tariff RPC, disables the old five-argument RPC, and restricts the new six-argument RPC to service_role. Existing RLS and historical records are preserved.
3. supabase-admin-security.sql: adds a private Admin allowlist and restricts product writes to authorized Admins. Bootstrap the intended Auth UUID as described in PRELAUNCH.md.

No SQL was executed. Database execution and concurrent last-unit purchases require staging verification. Apply both migrations before serving the new product save flow. Nothing was pushed or deployed.

Delivery uses SUM(product.weight_kg * quantity) for paid-delivery products ONLY and ONE inclusive upper-weight bracket from the exact official 15-row/four-type table. Free items do not increase shipping in mixed carts. No interpolation. Delivery type must be explicitly chosen: city, region, branch_pickup or village_highland. All-free carts cost zero delivery. Chargeable paid weight above 1000 kg blocks automatic checkout pending pricing confirmation.

Admin enters positive weight and a free-delivery flag, never shipping price. Product detail describes weight-based shipping. Cart/checkout show subtotal, total weight, selected type, delivery and total. Snapshots preserve actual type, charge, total/chargeable weight, bracket/version and item weight/free-delivery values.

api/orders.js is the Vercel server function. Auth ownership comes only from server-verified Supabase Auth; guest ownership is NULL. Browser ownership, totals, delivery costs and statuses are ignored. The database locks products, loads authoritative price/weight/free-delivery/stock, computes tariff and totals, inserts snapshots and decrements stock atomically. Browser expected values are confirmation guards only. p_delivery_cost is ignored and the server passes NULL. Browser roles cannot execute privileged RPCs. Existing RLS limits customer reads to their own orders/items; guests cannot read orders.

Required Vercel names:
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
ORDER_ALLOWED_ORIGINS
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY

The owner reports the first four configured in Production. Add Turnstile variables if absent. Only the public site key is returned to browsers; service-role and Turnstile secret keys stay server-side. No shipping environment variable is required. Missing configuration fails closed. Turnstile validates checkout action/hostname; allowed origins are checked. Configure platform rate limiting before launch.

Checkout tokens prevent duplicate retries. Failed checkout retains the cart; purchased quantities clear only after a persisted receipt. Authentication remains optional. Cash on delivery remains the only payment method.

Admin now requires the database-backed allowlist; customer login/metadata never grants authorization. The new Admin migration replaces product write policies and preserves reads. Bootstrap the intended Admin UUID and verify actual policies in staging before launch; unknown live RPCs/views cannot be certified from local source. See PRELAUNCH.md for the release checklist.

Passed local tests without production secrets, production orders or SQL execution:
node tests/product-delivery.cjs (all 60 rates/boundaries, product validation/mapping, static SQL security/stock/snapshot checks)
node tests/orders-api.cjs (mocked authoritative data, manipulated inputs, guest/auth identity, stock and origin/captcha failures)
node tests/orders-browser.cjs (desktop/mobile checkout/history, Admin create/edit, product detail and quantities)
node tests/cart-quantity.cjs (six widths and ID types)
node tests/customer-auth.cjs (intercepted Auth regression)
node tests/admin-security.cjs (Admin allow/deny, fail-closed behavior and static RLS/grants checks)

Historical tests/orders-sql.cjs was not run because it executes SQL. Static/mocked tests cannot prove PostgreSQL migration execution. No SQL, push, environment change or deployment was performed.
