# Discreet administrator entry (local review, not published)

The existing project is now at `C:/Users/ADMIN/OneDrive/Desktop/Movio.ge`.

## Implementation

- The existing visible footer administration links are replaced by an invisible entry in the footer lower-left, inside the original accessible 44px button (no marker or hover/focus styling, per request). No fixed overlay or storefront layout shift is introduced.
- Seven existing footer pages share `admin-entry.js` and `admin-entry.css`: index, cart, contact, delivery, privacy, returns and terms. Pages without a footer are not given an unrelated floating control.
- A separate native dialog handles administrator email/password through the existing Supabase Auth client. It has email/password autocomplete, loading/disabled state, safe errors, a close button, Escape, native focus containment and return focus. Password input is cleared after submission/close; no credentials are added to source or custom storage.
- Successful authentication is followed by the existing server-side `movio_is_admin` RPC. Customer sessions, failed role checks and role-check errors do not redirect. Closing the modal invalidates its pending redirect.
- `admin.html` keeps its existing independent authorization gate; direct URL access never bypasses it.
- `supabase-sync.js` now checks `movio_is_admin` before each product save/deactivation request, in addition to its existing session/UI checks. Its script query version is refreshed on pages that load it.
- Product fields, image management, order flows, customer Auth, catalog and cart implementations are otherwise unchanged. Existing unrelated working-tree changes are preserved.

## Backend authorization: what is and is not verified

The repository already contains `supabase-admin-security.sql`: a private UUID admin allowlist, security-definer role-check RPC, product RLS enabled, and separate admin-only product insert/update/delete policies. A browser flag or hidden entry is never a substitute for those backend policies.

A read-only anonymous call to the configured Supabase project's `movio_is_admin` RPC returned HTTP 401 / PostgreSQL 42501 (permission denied), confirming anonymous callers cannot execute that role-check function. No real product write, account creation, credential change, allowlist change, SQL migration or RLS change was performed.

The existing `supabase-product-policy-diagnostic.sql` and `supabase-production-check.sql` are owner-level read-only checks for the actual deployed RLS policies/grants. Public API access cannot certify those metadata. Live authorized-customer write rejection and the existing administrator's real credentials were NOT tested: these require authenticated test sessions/owner metadata access. Do not infer that mock tests prove deployed RLS. Review metadata first; do not blindly reapply the security migration, which replaces write policies and could disrupt existing authorization.

## Local validation

- `node tests/admin-entry.cjs`: per-operation create/edit/delete allowed for mocked server-authorized admin; guests/customers/forged UI flag/revoked role/RPC failures denied before writes.
- `node tests/admin-entry-browser.cjs`: headless Chrome at 375 and 1280px, seven footer pages, dot appearance/overlap/overflow, dialog focus and Escape, loading/errors, invalid credentials/customer/RPC rejection, allowed admin redirect and independent direct-URL guard, cart storage preservation. Authentication is mocked; no live passwords are used.
- Existing admin-security, runtime-guards, customer-auth, product-images, admin-orders and deployment-security checks are run as regressions. The image-management fixture explicitly supplies an allowed role for its existing mocked administrator.

No Git push, build publication or Vercel deployment is authorized or performed. These are reviewable local source changes only.
