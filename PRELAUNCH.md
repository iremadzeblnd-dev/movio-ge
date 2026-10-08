# MOVIO manual pre-launch steps

No SQL, production orders, secret/environment changes, push or deployment were performed.

## Migration order

Use PRODUCTION-READINESS.md for the current full migration order and release gates, including Admin orders and nationwide free shipping. This document also records the original prerequisite setup.

Review and manually run in Supabase SQL Editor, as the project owner:

1. `supabase-product-delivery.sql`
2. `supabase-weight-shipping-orders.sql`
3. `supabase-admin-security.sql`

Do NOT rerun `supabase-orders.sql`: it is already applied and unchanged.
The old fixed `delivery_price` migration was never applied and is no longer active.
The product migration permits NULL legacy weights so existing rows remain valid;
the later nationwide-free-shipping migration permits NULL weights for explicitly free products only.

## Authorize the first Admin

Obtain the UUID of the intended, explicitly authorized MOVIO Admin account from
Supabase Dashboard > Authentication > Users > the intended user's ID.
Use the existing Admin account, or create and verify that account first.
Do not use an email, customer metadata, a service key or an arbitrary customer UUID.

After migration 3, replace the placeholder below with that exact Auth user UUID
and manually run this command in SQL Editor:

```sql
insert into movio_private.admin_users (user_id)
values ('REPLACE_WITH_ADMIN_AUTH_USER_UUID'::uuid)
on conflict (user_id) do nothing;
```

The unedited placeholder cannot grant access. The foreign key requires an actual
Auth user. No account is automatically authorized. Browser roles cannot read or
write this private allowlist; only a trusted database operator can grant/revoke.
To revoke, delete that UUID's row manually as the database owner.

`movio_is_admin()` checks only verified `auth.uid()` against that private table.
The Admin UI checks this RPC and fails closed on denial/error/logout/refresh.
Product INSERT/UPDATE/DELETE are independently protected by RLS. Old ALL/write
policies are removed, preserving ALL policies' existing read predicates/roles as
SELECT policies. Ordinary existing SELECT policies are retained. Anonymous
mutation grants and destructive non-RLS privileges are revoked. Customer
registration or editable metadata cannot grant Admin access. Service-role
credentials remain server-only. The later Admin order-management RPCs enforce this same allowlist.

## Shipping and products

After migrations and Admin bootstrap, enter each product's positive weight and
free-delivery flag in Admin. Missing weight blocks checkout, never implies free.
Combined total weight includes every item times quantity. Chargeable weight
includes ONLY paid-delivery items times quantity, including mixed carts.
For example, 40 kg free plus 8 kg paid uses the 10 kg bracket: city 11 GEL.
All-free carts cost zero delivery. An explicit valid delivery type is required.
The exact 60 official tariff prices and inclusive boundaries are unchanged.
Paid weight over 1000 kg blocks automatic checkout; no price is invented.

The database locks authoritative products, checks stock and displayed confirmation
values, calculates price/subtotal/weight/tariff/delivery/total, snapshots the order
and decrements stock in one transaction. Browser amounts, weight/free flags,
ownership and statuses cannot choose actual values. Retry tokens remain protected.
Guests have NULL ownership; authenticated ownership comes from server-verified
Supabase Auth. Existing own-order RLS and guest read denial are unchanged.

## Turnstile and Vercel configuration

Already configured according to the owner:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ORDER_ALLOWED_ORIGINS`.

If absent, add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
No shipping environment variable or Admin UUID environment variable is needed.

In Cloudflare Dashboard > Turnstile, add a Managed widget for MOVIO. Add each
production storefront hostname (for example movio.ge and www.movio.ge if both
serve checkout). Set its public site key and server secret in the respective
Vercel variables above. Authorized preview/testing hostnames need explicit setup.
Do not put the secret in browser files. The client sets action `checkout`; the
server requires successful Siteverify, matching action and allowed hostname.
Missing configuration fails closed; security is never bypassed locally.

Keep ORDER_ALLOWED_ORIGINS limited to the exact storefront origins. Configure
platform rate limiting for POST /api/orders. Email confirmation/recovery redirect
URLs and actual email delivery still require dashboard/mailbox verification;
the existing optional signup/login/logout/recovery architecture is preserved.

## Verification and release gate

Six local suites passed: product-delivery, orders-api, admin-security,
orders-browser, customer-auth and cart-quantity. They use static inspection,
isolated VMs and mocked/intercepted browser/API requests, not production writes.
They cover all 60 rates/boundaries, mixed/free/paid/quantity/overweight cases,
manipulated price/weight/cost, guest/Auth identity, Admin UI allow/deny/error/logout,
product form regression and desktop/mobile cart/Auth/checkout/history.
SQL stock decrement, snapshot, RPC permissions and ownership policies were
reviewed statically. No PostgreSQL/RLS execution or concurrent stock test was run:
the instruction prohibited SQL. `tests/orders-sql.cjs` was intentionally not run.

Before enabling production checkout, apply/review these changes in staging and
verify actual non-admin product writes are denied, Admin writes succeed, customer
order isolation and guest denial hold, stock rolls back on failure, last-unit
concurrent purchases cannot oversell and idempotent retries create one order.
Audit any additional live SECURITY DEFINER RPCs/views that can mutate products;
unknown database objects cannot be certified from this repository alone.
Deploy only when authorized; this task did not deploy. Local code is ready for
these manual steps, but production launch is not certified before they pass.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
