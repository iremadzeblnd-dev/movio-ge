# Admin order management

Apply `supabase-admin-orders.sql` manually after the existing order, product delivery, weight shipping, and Admin security migrations. Do not rerun the already applied base order migration. No SQL was executed as part of this change.

The Admin browser calls `movio_admin_orders` and `movio_admin_order_status` with the signed-in Supabase session. Both PostgreSQL security-definer functions check `movio_is_admin()` on every request against `movio_private.admin_users`; browser flags and customer metadata grant no database access. The existing customer SELECT policies and column grants remain unchanged. No service-role key is needed in the Admin browser. Checkout `api/orders.js`, customer history, delivery pricing, and payment integration are unchanged.

The list loads pages of 100 persisted orders, including immutable product names, unit prices and quantities, customer contact/address, subtotal, delivery charge/type, total, payment status and order status. Dashboard metrics and customer histories use those orders, never local demo data. Use “შეკვეთების განახლება” to reload after another Admin or customer changes orders. Failed loads clear stale data and show an error. Active sessions are checked by the server on every RPC.

Allowed statuses: received, preparing, shipped, completed, cancelled. Completed/cancelled orders are terminal. Cancellation locks the order, restores each reserved product quantity in stable product order, and stamps `stock_restored_at` in the same transaction as the status update. Repeated/concurrent cancellation of that order cannot restore stock twice. Any failure rolls back all changes. Payment status is preserved; this action performs no bank operation or refund.

Restoration changes only product stock quantity and its update timestamp. It preserves the configured `stock_status`, including a manually selected out-of-stock status even when the restored quantity is positive. An Admin can change availability separately through product management.

Historical cancelled orders are not automatically restocked because their earlier restoration history is unknown. If a reserved product was deleted or its stock is NULL, cancellation fails atomically with no partial restock; resolve the missing product through an owner-reviewed process before retrying. The migration never creates replacement products or rewrites historical orders.

Manual staging checks after applying the migration:

- Confirm the intended Admin Auth UUID is already in the private allowlist, following `PRELAUNCH.md`.
- As a guest and ordinary customer, call both Admin RPCs and confirm denial. Confirm customers can still read only their own orders/items and cannot update either table directly.
- As an allowlisted Admin, verify guest/customer orders, historical snapshots, shipping totals, payment status, filters, refresh and status changes.
- On a staging order with known stock, issue simultaneous and repeated cancellations. Confirm stock increases by exactly the reserved quantities once, and the order cannot reopen. Confirm cancelled/completed historical orders remain untouched.
- Set a reserved product's status manually to out of stock before cancellation. Confirm its quantity is restored once and its configured status remains out of stock, including on repeated requests.
- Verify rollback with a missing product, and allowlist removal while an Admin session is active. Inspect actual deployed grants/policies and any unrelated legacy RPCs/views.
- Perform storefront/cart/product/authentication smoke checks. Offset pagination refreshes current data; orders arriving during a long multi-page load may require another refresh.

Local verification uses mocked browser/API tests and static SQL review. `tests/orders-sql.cjs` executes SQL and must not be run under the no-SQL instruction. Real PostgreSQL execution and concurrency are pending the manual staging checks above.

Passed: `node tests/admin-orders.cjs`, `node tests/admin-security.cjs`, `node tests/orders-api.cjs`, `node tests/product-delivery.cjs`, `node tests/orders-browser.cjs`, `node tests/cart-quantity.cjs`, and `node tests/customer-auth.cjs`. Browser tests required a sandbox escalation for headless Chrome to start and used isolated local profiles and mocked services.

Nothing was pushed or deployed. Deploy updated assets/functions only through the owner's separate release process after staging approval.
