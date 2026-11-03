# MOVIO

HTML/CSS/JavaScript storefront with Supabase products and optional customer Auth, hosted on Vercel. Real orders use a server endpoint and atomic database RPC. Delivery uses combined paid-product weight and the official delivery-type tariff. Free items contribute zero shipping weight, including mixed carts.

Read [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for the complete migration order and [PRELAUNCH.md](PRELAUNCH.md) for Admin bootstrap before enabling checkout. Reconcile deployed migration effects before applying anything; do not rerun the already applied supabase-orders.sql. The nationwide-free-shipping migration must be the final checkout implementation. Verify the intended Admin UUID, product shipping data, Turnstile and actual database permissions before launch.

For local preview using the current Supabase catalog (local checkout is disabled):

```powershell
node scripts/start-local.cjs
```

Open http://127.0.0.1:4173/ or http://127.0.0.1:4173/admin.html. This command starts a hidden background server, checks both pages, and can be run again safely. The server survives closing the launching terminal. It always uses port 4173, regardless of an inherited `PORT` setting. Logs are in `tmp/local-server.log` (ignored by Git). Port conflicts are reported without stopping unrelated processes.

Restart after changing server code: `node scripts/start-local.cjs --restart`. Only a server identifying itself as this project's preview is stopped. To run in the foreground instead, use `node scripts/dev-server.cjs`; closing that terminal or pressing Ctrl+C stops that foreground server. No server runs automatically after reboot; run the startup command again.

Product synchronization only reads Supabase; browser product caches are never restored or uploaded. Local checkout remains disabled.

For an explicit offline preview, run `node scripts/dev-server.cjs --offline`. This mode shows a visible mock notice, fetches the current in-memory catalog on every visit, and runs the Vercel handler against a simulated backend. It overrides inherited credentials and blocks outbound requests. No real orders are created. Static hosting cannot execute /api/orders. Cash on delivery remains the only payment method.

[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) is the current release checklist and migration order. Admin orders are implemented. Product writes await server confirmation and removal deactivates rows to preserve cancellation stock references. No SQL, real orders, push or deployment occurred.
