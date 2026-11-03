# MOVIO customer accounts

Customer registration is optional. Browsing, search, cart and checkout do not require an account. See [ORDERS.md](ORDERS.md) for real order checkout configuration.

`customer-auth.js` now uses the existing `window.movioSupabase.auth` client for signup, password login, logout, session restoration and password recovery. First and last names are stored in Supabase Auth user metadata (`first_name`, `last_name`, `full_name`); passwords are handled by Supabase, never stored by MOVIO. The old browser-only demo account/session records are removed. Those old demo accounts must register again; they are not migrated into Supabase.

The profile shows first name, last name and email. Order history reads authenticated customers' own Supabase orders and purchased snapshots, protected by RLS. It shows `შეკვეთები ჯერ არ გაქვთ.` when the query succeeds with no orders. Local Admin orders are never exposed through customer email matching. Checkout prefills known name/email only, preserves manual edits, and clears unchanged automatic values when signing out.

The header refreshes the authenticated user's Auth metadata using `auth.getUser()` after session restoration and Auth changes. It accepts canonical names plus legacy camelCase, given/family-name and embedded profile fields. Requests are deferred outside the synchronous Auth callback, and responses from an older auth state are discarded. Previously, the header only used cached session metadata and silently fell back to `ანგარიში` when no recognized first name existed.

When the server confirms the name is missing, the existing account dialog asks for it. The customer can defer once per tab session; reopening the account button offers the form again. A successful `auth.updateUser({data: ...})` saves the canonical `first_name` and `full_name` on that authenticated customer's account, without changing privileges, credentials, or Admin authentication. After saving, refreshes use the stored name and do not prompt again. Failed saves remain retryable and never claim success. The signed-out label is `ანგარიში`.

Read-only live configuration checks found email signup enabled, confirmation required, and neither `profiles` nor `customer_profiles` exposed by the project's REST API. This repository uses Auth user metadata as its customer profile; no table or migration was added. Actual customer metadata requires that customer's authenticated session and was not accessed during the audit. See Supabase's [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) and [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser) documentation.

## Supabase setup

No new customer password/profile table is required for authentication. The original `supabase-orders.sql` has already been applied and must NOT be rerun. See [PRELAUNCH.md](PRELAUNCH.md) for the new shipping/Admin migrations. The existing project URL, browser-safe key and Supabase client remain unchanged.

The existing project has email signup enabled and email confirmation required. Verify the Auth URL configuration includes the actual confirmation and recovery destinations:

- `http://localhost:4173/index.html?account=confirmed`
- `http://localhost:4173/index.html?account=recovery`
- The equivalent URLs for `127.0.0.1`, your production domain, or your LAN host if testing on an iPhone.

Supabase requires allowed redirect URLs; see [Auth redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls). These dashboard settings and email delivery settings were not changed by this implementation. Use your own mailbox to verify confirmation and recovery email delivery.

Admin now requires a private database allowlist checked by `movio_is_admin()`. Apply `supabase-admin-security.sql` and bootstrap the explicitly authorized Auth user UUID using [PRELAUNCH.md](PRELAUNCH.md). Product writes are restricted by RLS independently of UI checks. Customer signup/login or editable metadata cannot grant Admin privileges. Order ownership policies remain unchanged. Runtime database verification remains required; no SQL was executed during this task.

## Local testing

Customer self-deletion is implemented with password confirmation, a server-authorized endpoint and a database deletion guard. See [CUSTOMER-ACCOUNT-DELETION.md](CUSTOMER-ACCOUNT-DELETION.md) for order-retention behavior, admin protection, local preview restrictions and tests. The owner reports successfully applying the guard migration and passing all 21 production security checks. Those passed checks were not repeated. Deletion fails closed without a successful readiness check; the candidate endpoint is not yet deployed.

From the project directory, run `node scripts/start-local.cjs`, then open `http://127.0.0.1:4173/index.html`. Use `node scripts/start-local.cjs --restart` to restart the background preview.

1. While signed out, search for a real product, add it to the cart and open checkout. No account prompt should be required.
2. Click `ანგარიში`, then `რეგისტრაცია`. Enter only first name, last name, email, password and repeated password. Confirm the email using your mailbox, then log in.
3. Check the header first name, profile information and empty orders panel. Reload and navigate to the cart to verify session persistence. Only known name/email should prefill checkout; manually edited values should remain intact.
4. Log out and reload. Guest shopping should remain available and the header should show `ანგარიში`.
5. Use `პაროლი დაგავიწყდა?`, open the recovery email link, save a new password and verify login with it.
6. Repeat on desktop and iPhone Safari. The dialog scrolls on small screens, inputs use 16px text, and close controls have a 44px minimum target.

Automated browser checks (Node 22+ and Chrome installed; set `CHROME_PATH` if needed):

```sh
node tests/customer-auth.cjs
node tests/cart-quantity.cjs
```

Auth tests use the actual Supabase JavaScript SDK with isolated Auth endpoint responses: no real accounts, emails or database writes. They cover signup payload/confirmation, validation, login errors, login/logout, reload persistence, password reset/recovery, profile/orders privacy, safe checkout prefilling and layouts at 1280/390/320px. Cart regression checks cover six widths and numeric/string product IDs.

A separate local Chrome smoke check passed against the unmodified real Supabase/storefront loading flow: current product search, guest add-to-cart, checkout access and optional auth layouts at 1280/390/320px. No order was submitted. Actual mailbox confirmation/reset delivery and physical iPhone Safari still require manual verification; viewport tests are Chrome emulation.
