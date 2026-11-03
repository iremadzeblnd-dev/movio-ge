-- Read-only metadata check: run in the EXISTING Supabase project's SQL Editor as postgres.
-- Returns no customer rows, credentials or function bodies. Does not delete or alter anything.
-- PASS checks metadata only; REVIEW requires inspection, not automatic migration reapplication.
WITH expected(signature, body_md5, customer_callable) AS (VALUES
 ('movio_private.customer_deletion_retention_ready()', 'aee75357f1e98615ef6e7943d18dbf2a', false),
 ('movio_private.guard_customer_account_deletion()', '596d10210907b9ca1045443a7322d274', false),
 ('public.movio_customer_deletion_check()', '8f72f8a794f434e34cc621dd6544ed63', true)
), functions AS (
 SELECT e.*, p.oid, p.prosecdef, p.proconfig, p.prosrc, p.proowner
 FROM expected e LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.signature)
), checks(name, ok) AS (
 SELECT signature || ': exact source', oid IS NOT NULL AND md5(replace(prosrc, chr(13), '')) = body_md5 FROM functions
 UNION ALL SELECT signature || ': security definer / empty search_path',
   oid IS NOT NULL AND prosecdef AND coalesce(proconfig @> ARRAY['search_path=""']::text[], false) FROM functions
 UNION ALL SELECT signature || ': trusted owner', oid IS NOT NULL AND EXISTS (
   SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid = proowner AND r.rolname IN ('postgres','supabase_admin')
 ) FROM functions
 UNION ALL SELECT signature || ': anon denied', oid IS NOT NULL AND NOT pg_catalog.has_function_privilege('anon', oid, 'EXECUTE') FROM functions
 UNION ALL SELECT signature || ': authenticated privilege', oid IS NOT NULL AND
   pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE') = customer_callable FROM functions
 UNION ALL SELECT 'enabled BEFORE DELETE ROW guard', EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = pg_catalog.to_regclass('auth.users')
   AND t.tgname = 'movio_guard_customer_account_deletion' AND NOT t.tgisinternal
   AND t.tgtype = 11 AND t.tgenabled IN ('O','A')
   AND t.tgfoid = pg_catalog.to_regprocedure('movio_private.guard_customer_account_deletion()')
 )
 UNION ALL SELECT 'orders user_id nullable', EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('public.orders')
   AND a.attname = 'user_id' AND NOT a.attnotnull AND NOT a.attisdropped
 )
 UNION ALL SELECT 'orders user_id FK: exactly one / ON DELETE SET NULL', count(*) = 1 AND coalesce(bool_and(c.confdeltype = 'n'), false)
 FROM pg_catalog.pg_constraint c WHERE c.contype = 'f'
 AND c.conrelid = pg_catalog.to_regclass('public.orders') AND c.confrelid = pg_catalog.to_regclass('auth.users')
 AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = pg_catalog.to_regclass('public.orders') AND attname = 'user_id')]
 AND c.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = pg_catalog.to_regclass('auth.users') AND attname = 'id')]
 UNION ALL SELECT 'admin allowlist exists', pg_catalog.to_regclass('movio_private.admin_users') IS NOT NULL
)
SELECT name AS check_name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM checks
UNION ALL
SELECT 'Auth FK review: ' || c.conrelid::regclass::text || '.' || c.conname,
 CASE WHEN c.conrelid IN (pg_catalog.to_regclass('public.orders'), pg_catalog.to_regclass('movio_private.admin_users')) THEN 'PASS' ELSE 'REVIEW' END
FROM pg_catalog.pg_constraint c WHERE c.contype = 'f' AND c.confrelid = pg_catalog.to_regclass('auth.users')
AND c.connamespace <> (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'auth')
ORDER BY 2, 1;
