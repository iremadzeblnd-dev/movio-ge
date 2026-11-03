# Existing Cloudflare Pages project — release setup

Keep the current Supabase project and all records. No new migration is needed for this hosting adapter; accepted production migration checks remain valid. Do not reapply orders/admin/deletion SQL.

The repo contains 42 current frontend assets plus a dedicated safe static-output builder. Existing Node/Vercel API handlers also accept request-scoped runtime bindings. Pages Functions wrap them at `/api/orders` and `/api/customer-account`; unknown API paths return 404. Self-service deletion remains disabled. Existing customer login and Admin authorization remain unchanged.

Before pushing main to an automatically deploying project, verify its existing configuration:

- Framework: None; repository root: `/`; production branch: `main`.
- Build command: `npm run build:cloudflare`; output directory: `dist-cloudflare`.
- Keep `functions/` in the repository root, outside public output. Do not deploy repository root as static output or copy `api/`, `.env`, SQL, docs, tests or backups into public assets.
- Set server-side bindings for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `ORDER_ALLOWED_ORIGINS` for the intended environment. No values belong in source or the static build. Preserve existing working values; verify rather than overwrite. Allowed origins must include the actual Pages storefront origin and no arbitrary wildcard.
- Permit the actual Pages hostname in the existing Turnstile widget. Add exact `https://<actual-domain>/index.html?account=confirmed` and `?account=recovery` URLs in Supabase Auth if needed; retain existing working URLs during transition. Do not invent a project/domain name.
- Deploy tests to the existing project's preview environment only after its origin, widget and bindings are ready. Never test by creating production orders or deleting users.

Wrangler compilation and local request/asset tests are read-only/local. A Git push is a release action when Pages automatic deployments are enabled. Missing bindings fail closed but are still a broken checkout, so do not push before those existing project settings are verified.
