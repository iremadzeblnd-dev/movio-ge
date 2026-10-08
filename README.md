# MOVIO

HTML/CSS/JavaScript storefront with Supabase products and optional customer Auth, hosted on Vercel. Real orders use a server endpoint and atomic database RPC. Delivery uses combined paid-product weight and the official delivery-type tariff. Free items contribute zero shipping weight, including mixed carts.

Read [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for the complete migration order and [PRELAUNCH.md](PRELAUNCH.md) for Admin bootstrap before enabling checkout. Reconcile deployed migration effects before applying anything; do not rerun the already applied supabase-orders.sql. The nationwide-free-shipping migration must be the final checkout implementation. Verify the intended Admin UUID, product shipping data, Turnstile and actual database permissions before launch.

For local preview using the current Supabase catalog (local checkout is disabled):

```powershell
node scripts/dev-server.cjs
```

Open http://127.0.0.1:4173. Product synchronization only reads Supabase; browser product caches are never restored or uploaded. Restart an already-running preview server after changing its code.

For an explicit offline preview, run `node scripts/dev-server.cjs --offline`. This mode shows a visible mock notice, fetches the current in-memory catalog on every visit, and runs the Vercel handler against a simulated backend. It overrides inherited credentials and blocks outbound requests. No real orders are created. Static hosting cannot execute /api/orders. Cash on delivery remains the only payment method.

[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) is the current release checklist and migration order. Admin orders are implemented. Product writes await server confirmation and removal deactivates rows to preserve cancellation stock references. No SQL, real orders, push or deployment occurred.
