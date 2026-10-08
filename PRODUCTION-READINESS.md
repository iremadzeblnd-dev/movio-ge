# MOVIO production readiness

Latest release attempt: see [DEPLOYMENT-STATUS.md](DEPLOYMENT-STATUS.md). All 16 suites now pass, including disposable PostgreSQL execution of the current migration chain. Production is still blocked: the linked Vercel project lacks both Turnstile variables, its existing `/api/orders` returns 404, and live database/Auth/order release gates remain unverified. Earlier skipped-SQL statements below describe the earlier readiness review.

Local code and mocked regressions are verified. Production launch is blocked on the live database, configuration and owner-policy checks below. No SQL, real orders, production data changes, push or deployment occurred.

## Migration order

Inspect applied history. Apply only unapplied scripts through a trusted database owner:

1. supabase-orders.sql: reported already applied. **Never rerun it.**
2. supabase-product-delivery.sql: product weight_kg and free_delivery.
3. supabase-weight-shipping-orders.sql: snapshots, server-only six-argument RPC and disabled five-argument checkout.
4. supabase-admin-security.sql: private allowlist and product RLS. Do not blindly rerun named policies.
5. supabase-admin-orders.sql: Admin listing/status and idempotent restoration preserving configured stock status.
6. supabase-nationwide-free-shipping.sql **last**: optional free-product weight and COALESCE total weight.

Verify specifications/discount columns from their existing migrations before product saves. The original products schema is absent from this repository; deployed columns/types, additional RPCs, policies and grants require owner verification. Reapplying weight-shipping afterward would overwrite nationwide free shipping. Checkout must remain service_role-only. No new migration was needed for this readiness work; PostgreSQL execution remains unverified.

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
