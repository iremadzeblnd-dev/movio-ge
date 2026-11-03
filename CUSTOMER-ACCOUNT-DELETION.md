# Customer account deletion — local implementation

**Current owner instruction supersedes activation steps below:** self-service deletion is disabled until lawful retention rules are confirmed. Both the real server handler and customer client have a source-controlled false release gate; the profile offers no delete action and direct client calls make no request. Server POST returns 503 before any Auth/database call. No environment variable can enable it. The SQL guard remains installed and unchanged; do not rerun or remove it. Contact-based rights requests remain available. Activation and real deletion acceptance tests are future feature gates, not instructions to enable it for this release. No retention period has been chosen.

No live accounts were deleted by this verification, and no push or deployment was performed. The owner reports that the deletion migration was successfully applied to the existing production Supabase project.

## Remaining verification — 2026-11-03

The owner subsequently confirmed all 21 production security checks passed. This resolves the production metadata gate on owner-provided evidence; those checks were not repeated. Earlier live non-mutating probes also confirmed that the readiness RPC rejects anonymous requests (401 / 42501) and invalid sessions (401 / PGRST301).

[supabase-customer-deletion-check.sql](supabase-customer-deletion-check.sql) is the completed SELECT-only metadata check, not a pending migration. It checks source fingerprints, function privileges/ownership/search paths, the enabled BEFORE DELETE row trigger, nullable order ownership, ON DELETE SET NULL and additional Auth foreign keys. Do not repeat the passed checks or reapply the migration.

Already passed: mocked server authorization/failure tests; isolated migration/retention/rollback and admin-protection tests; full current migration chain; customer browser deletion/cleanup/refresh at 1280/390/320 px in both themes; admin and public-secret checks. The remaining local Vercel packaging check also passed: the exact endpoint source is a Node 24 server function and is absent from public assets. Build success does not verify production secret values. No passed suite was repeated during the final review.

Vercel read-only follow-up: the existing project uses root '.', Other framework and Node 24. All four deletion-required Production variable names exist; their hidden values were not retrieved. The current production deployment is Ready but lists only api/orders; GET /api/customer-account returns 404. The local candidate's server function packaging already passed. Publish the reviewed candidate to this same project only after authorization and remaining release gates are resolved; no new project or configuration change is indicated.

Release remains blocked on privately verifying actual server configuration (matching Supabase URL/keys and exact allowed storefront origins), making the candidate endpoint available through an authorized deployment, and provider-integrated deletion acceptance under a separately authorized, controlled test plan. No new project is required or authorized. No actual provider account deletion or multi-connection race test was performed. Seller identification and the shared business/return address have now been supplied by the owner and filled in all three legal pages. Remaining policy gaps are advance return-cost estimates for goods that cannot be posted normally, processing/retention bases and criteria, actual sharing details and international-processing arrangements. No values have been invented.

## Final local technical pass

The deletion handler now revokes the separate password-verification session with local scope before deletion or response delivery. It never uses the customer's original bearer for cleanup; a failed cleanup blocks deletion. Focused mocked tests cover cleanup before deletion, wrong-user rejection, provider failure, cleanup failure and retention of the original session. The orders and deletion handlers require the exact JSON media type, accepting case and charset parameters while rejecting misleading suffixes. Relevant handler tests were repeated because their code changed; production SQL and unchanged authentication/browser suites were not repeated.

The updated legal pages passed local browser checks at 320/375/768/1280/1920 px in both themes. The changed candidate was rebuilt locally; packaging verifies exact frontend/server sources and excludes private/development artifacts. A public read-only production check returned HTTP 200 for /api/orders with cash-on-delivery configuration and HTTP 404 for /api/customer-account. All six Production variables remain hidden and have no reported update after the last inspected deployment; that does not verify their values or matching provider configuration. No commit, push, deployment, real checkout or deletion was performed.

## Operation

The customer profile offers `ანგარიშის წაშლა` only after a successful non-admin role check. The existing account dialog requires the current password and the exact confirmation `წაშლა`. Cancel makes no deletion request. Passwords are cleared after attempts and dialog closure.

`POST /api/customer-account` accepts only password and confirmation, never a target user ID. It requires an explicitly allowed Origin, JSON, a valid Bearer session, successful database readiness/role checks, and password reauthentication returning the same user. It calls Supabase's Admin deletion API with the existing server environment key; no privileged key is sent to the browser. Upstream errors, passwords, sessions and customer identities are not logged or returned.

The new database guard blocks deletion of allowlisted admins even if they are promoted after preflight. It requires the existing order foreign key to use ON DELETE SET NULL. In the deletion transaction it replaces that customer's normalized retry payload with an `account_deleted` marker; orders, items, accounting amounts, payment/order status and inventory remain intact. The existing foreign key detaches retained orders from the deleted Auth identity. If deletion fails, database changes roll back.

Successful client cleanup signs out the deleted identity, clears its SDK session and matching pending-checkout/name-prompt state, and keeps cart/theme preferences. It does not erase another account's pending request or remotely clear other devices. A new account does not inherit old order ownership merely by reusing an email address. Stateless JWTs may remain cryptographically valid until expiry; server Auth checks reject the deleted identity, and retained orders no longer have its user ID.

## Readiness before enabling real deletion

1. The owner reports applying `supabase-customer-account-deletion.sql`. Verify the installed metadata using the read-only checker above; do not rerun the original orders migration. Installation creates functions and a BEFORE DELETE guard; it does not delete users or alter admin membership.
2. Verify `movio_customer_deletion_check()` is available to authenticated callers, unknown callers cannot delete users, and the guard is enabled. Missing/unsafe readiness returns an error; the API does not fall back to unguarded Admin deletion.
3. Use the existing server variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_ALLOWED_ORIGINS`. No new variable is required. Correct values and allowed production origins need verification without exposing them.
4. Review any non-repository tables/triggers referencing Auth users, Storage objects owned by a user, and actual deployment constraints. Supabase may reject deletion for users owning Storage objects; the application reports failure rather than deleting files or broadening permissions automatically.
5. Confirm the lawful retention criteria, necessary order fields, erasure process and backup/log lifecycle. This change preserves existing order records; it does not invent a retention period or authorize indefinite retention of all personal data.

The local preview server explicitly returns 503 for this endpoint and never deletes production accounts. Browser tests use a simulated endpoint; API tests mock all upstream calls; SQL tests use disposable PostgreSQL/WASM. Multi-connection concurrency and real-provider deletion have not been certified by those tests.

## Validation

```powershell
node tests/customer-deletion-api.cjs
# Set MOVIO_PGLITE_PATH to an existing isolated @electric-sql/pglite installation.
node tests/customer-deletion-sql.cjs
node tests/customer-auth.cjs
node tests/admin-security.cjs
node tests/deployment-security.cjs
```

The browser suite covers correct/invalid confirmation, cancel, failed/successful deletion, password clearing, admin presentation/server rejection, local data cleanup, refresh, both themes and mobile/desktop sizes. SQL checks cover admin protection after preflight, missing guards, unsafe cascading order FKs, transactional rollback, order/item retention and retry-data redaction.

Supabase references: [server-only deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [user deletion and session caveats](https://supabase.com/docs/guides/auth/managing-user-data).
