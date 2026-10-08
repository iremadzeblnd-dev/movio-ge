# MOVIO production readiness

Current owner-selected release route: [FINAL-LAUNCH-CHECKLIST.md](FINAL-LAUNCH-CHECKLIST.md), using existing projects only. Prior SQL/product-policy checks are accepted, no pending migration is identified, and no rerun is requested. Actual configuration values, correct-candidate deployment and real runtime verification remain distinct gates. Earlier staging instructions are superseded.

Current remaining launch gates and Georgian final report: [LAUNCH-PREPARATION.md](LAUNCH-PREPARATION.md). The 404 root cause is an old deployed revision without the API; current routing/build pass. Prior metadata/product-policy checks are accepted and do not need to be repeated. Follow the new report's single owner checklist; older audit snapshots below are historical.

Current comprehensive audit: [PRODUCTION-AUDIT-FINAL.md](PRODUCTION-AUDIT-FINAL.md). All 19 suites pass and the local Vercel production build succeeds. Both Turnstile variable names now exist; actual Secret values remain unverified. The live order API still returns 404, and database/staging/owner-policy release gates remain open. The earlier verification statements below are historical; use the current audit for test results and launch steps.

Latest follow-up: owner-supplied live diagnostics resolve the three product RLS reviews (five policies, public catalog reads, Admin-only writes and one protected Admin allowlist row). Order RPC/RLS and intended Admin identity still require verification. This pass ran no SQL/migrations: 18 suites passed, including two static-only SQL checks; one migration-executing suite was deliberately skipped. See the current audit's consolidated owner checklist.

Local code and mocked regressions are verified. Production launch is blocked on the live database, configuration and owner-policy checks below. No SQL, real orders, production data changes, push or deployment occurred.

## Migration order

Inspect applied history. Apply only unapplied scripts through a trusted database owner:

1. supabase-orders.sql: reported already applied. **Never rerun it.**
2. supabase-product-delivery.sql: product weight_kg and free_delivery.
3. supabase-weight-shipping-orders.sql: snapshots, server-only six-argument RPC and disabled five-argument checkout.
4. supabase-admin-security.sql: private allowlist and product RLS. Do not blindly rerun named policies.
5. supabase-admin-orders.sql: Admin listing/status and idempotent restoration preserving configured stock status.
6. supabase-nationwide-free-shipping.sql **last**: optional free-product weight and COALESCE total weight.

Verify specifications/discount columns from their existing migrations before product saves. The original products schema is absent from this repository; deployed columns/types, additional RPCs, policies and grants require owner verification. Reapplying weight-shipping afterward would overwrite nationwide free shipping. Checkout must remain service_role-only. No new migration was needed for this readiness work. SQL behavior was tested in disposable local databases; production migration effects remain unverified.

## Admin/product behavior

Confirm the intended existing Auth UUID is in movio_private.admin_users. Metadata/email/browser flags cannot authorize database writes; product RLS and order RPCs independently check the allowlist.

Product mutations now await Supabase confirmation. Edits compare cached stock and stock_status, rejecting concurrent reservations; refresh before retrying. Removal sets active=false instead of deleting the row. Admin/catalog lists hide it; cancellation references and snapshots survive.

When the cache has updated_at, edits also compare that timestamp and the product's active state to reject stale price/settings edits or accidental reactivation. Background catalog refresh does not interrupt an open/busy Admin product form.

## Required server environment names

- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ORDER_ALLOWED_ORIGINS — exact comma-separated approved origins
- TURNSTILE_SITE_KEY
- TURNSTILE_SECRET_KEY

Verify target Vercel configuration without exposing secrets. Missing configuration fails closed. Turnstile requires approved production hostnames and action checkout. Configure Supabase Auth confirmation/recovery redirects, verify email delivery and configure checkout/Auth rate limits. The Node handler uses fetch, AbortSignal.timeout, Buffer and standard Vercel request/response methods; verify target runtime support.

## Owner information required

Delivery/contact/privacy/returns/terms pages now exist and disclose missing information. They are not approved business policies. Supply and approve:

- Seller legal identity, registration/tax details and business address.
- Working hours, contact details and social profile URLs.
- Delivery timeframes, coverage/exceptions, pickup and fulfillment terms.
- Returns/refunds/cancellation, warranty, eligibility, procedure and costs.
- Privacy controller/contact, purposes, processors/recipients, retention, rights and browser storage/cookie disclosures.
- Final sales terms.

Existing phone/email were preserved. No legal rights, refund windows or delivery guarantees were invented. Do not launch with incomplete policies.

## Local verification

Ten non-SQL suites: admin-orders, admin-security, free-shipping-migration, orders-api, orders-http, product-delivery, site-readiness, orders-browser, cart-quantity and customer-auth. JS syntax checks pass. Browser tests use isolated local Chrome profiles and mocked/intercepted services. orders-sql.cjs was deliberately skipped because it executes SQL.

Coverage: product-to-cart-to-confirmation, guest/Auth, failed/malformed receipts preserving cart/token, retries, all 60 tariffs, free/paid/mixed shipping, hidden selector, address validation, product settings/discounts, failed writes, Admin authorization/logout, account registration/reset/recovery/persistence, search/filtering/redirects and 320–1280px layouts.

## Manual release gates

- Verify live migration history, columns, RPC signatures/owners/grants, RLS and any extra SECURITY DEFINER objects. Guests/customers must be denied Admin mutations; customer order reads must remain own-only.
- Apply only missing migrations in staging. Confirm persisted orders appear in Supabase and authorized Admin. This has not been verified against a real database.
- Test concurrent last-unit purchase, rollback, duplicate receipts and repeated/concurrent cancellation. Confirm stock restoration once, terminal statuses, manual out-of-stock preservation and deactivated-product restoration.
- Test stale Admin edits versus checkout, failed writes and allowlist removal during an active session.
- Verify real signup/recovery emails, redirects and customer isolation in staging.
- Test real Safari/iOS and accessibility. Chrome responsive checks passed; Safari was unavailable on Windows.
- Verify Vercel runtime/configuration, Turnstile, vercel.json response headers and rate limits.
- Complete owner-approved policies before a separately authorized release.

Current audit results and release gates are in [PREDEPLOYMENT-AUDIT.md](PREDEPLOYMENT-AUDIT.md).

Local catalog preview: `node scripts/dev-server.cjs` at http://127.0.0.1:4173 reads the real Supabase catalog and disables local checkout. Explicit isolated preview: `node scripts/dev-server.cjs --offline` runs the Node API handler with in-memory services, overrides inherited credentials and blocks outbound requests. Static hosting cannot execute the API. Auth/Admin are covered by separate tests.
