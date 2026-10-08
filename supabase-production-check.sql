-- MOVIO production verification: one metadata-only WITH ... SELECT statement.
-- Run as trusted database owner in Supabase SQL Editor (normally postgres).
-- No application rows, customer values, credentials or function bodies are returned.
-- No MOVIO function is called; no dynamic SQL or migrations are executed.
-- PASS = metadata matches; FAIL = missing/incompatible/unsafe metadata;
-- REVIEW = drift, extra objects, or a condition metadata cannot certify.
-- Body MD5 fingerprints detect source drift, not semantic equivalence/security proof.
-- Migration filenames are remediation hints, not proof of applied migration history.
-- Historical nullable shipping fields are intentional. Original products DDL is
-- absent from this repository: additional product schema checks need owner review.
-- Do not blindly reapply migrations in response to a failure.
WITH
required_tables(name,source) AS (VALUES
 ('public.products','original products schema'),('public.orders','supabase-orders.sql'),
 ('public.order_items','supabase-orders.sql'),('movio_private.admin_users','supabase-admin-security.sql'),('auth.users','Supabase Auth')),
roles AS (
 SELECT e.name,r.oid,r.rolsuper,r.rolbypassrls FROM (VALUES ('anon'),('authenticated'),('service_role')) e(name)
 LEFT JOIN pg_catalog.pg_roles r ON r.rolname=e.name
),
relations AS (
 SELECT e.*,c.oid,c.relkind,c.relrowsecurity,c.relowner FROM required_tables e
 LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(e.name)
),
required_columns(table_name,column_name,type_pattern,required_not_null,source) AS (VALUES
 ('public.products','id','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','name','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','category','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','category_key','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','description','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','image','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','stock_status','^(text|character varying(\([0-9]+\))?)$',NULL,'original products schema/application'),
    ('public.products','price','^numeric(\([0-9]+,[0-9]+\))?$',NULL,'original products schema/application'),
    ('public.products','old_price','^numeric(\([0-9]+,[0-9]+\))?$',NULL,'original products schema/application'),
    ('public.products','discount_percent','^numeric(\([0-9]+,[0-9]+\))?$',true,'supabase-discount.sql'),
    ('public.products','stock','^(integer|bigint)$',NULL,'original products schema/application'),
    ('public.products','active','^boolean$',NULL,'original products schema/application'),
    ('public.products','old_price_visible','^boolean$',NULL,'original products schema/application'),
    ('public.products','stock_quantity_visible','^boolean$',NULL,'original products schema/application'),
    ('public.products','stock_status_visible','^boolean$',NULL,'original products schema/application'),
    ('public.products','created_at','^timestamp with time zone$',NULL,'original products schema/application'),
    ('public.products','updated_at','^timestamp with time zone$',NULL,'original products schema/application'),
    ('public.products','weight_kg','^numeric\(12,3\)$',false,'supabase-product-delivery.sql'),
    ('public.products','free_delivery','^boolean$',true,'supabase-product-delivery.sql'),
    ('public.products','specifications','^jsonb$',true,'supabase-specifications.sql'),
    ('public.products','discount_visible','^boolean$',true,'supabase-discount.sql'),
    ('public.orders','id','^uuid$',true,'supabase-orders.sql'),
    ('public.orders','checkout_token','^uuid$',true,'supabase-orders.sql'),
    ('public.orders','user_id','^uuid$',false,'supabase-orders.sql'),
    ('public.orders','order_number','^text$',true,'supabase-orders.sql'),
    ('public.orders','first_name','^text$',true,'supabase-orders.sql'),
    ('public.orders','last_name','^text$',true,'supabase-orders.sql'),
    ('public.orders','phone','^text$',true,'supabase-orders.sql'),
    ('public.orders','city','^text$',true,'supabase-orders.sql'),
    ('public.orders','address','^text$',true,'supabase-orders.sql'),
    ('public.orders','delivery_information','^text$',true,'supabase-orders.sql'),
    ('public.orders','payment_method','^text$',true,'supabase-orders.sql'),
    ('public.orders','payment_status','^text$',true,'supabase-orders.sql'),
    ('public.orders','order_status','^text$',true,'supabase-orders.sql'),
    ('public.orders','email','^text$',false,'supabase-orders.sql'),
    ('public.orders','request_payload','^jsonb$',true,'supabase-orders.sql'),
    ('public.orders','subtotal','^numeric\(12,2\)$',true,'supabase-orders.sql'),
    ('public.orders','delivery_cost','^numeric\(12,2\)$',true,'supabase-orders.sql'),
    ('public.orders','total','^numeric\(12,2\)$',true,'supabase-orders.sql'),
    ('public.orders','created_at','^timestamp with time zone$',true,'supabase-orders.sql'),
    ('public.orders','updated_at','^timestamp with time zone$',true,'supabase-orders.sql'),
    ('public.orders','delivery_type','^text$',false,'supabase-weight-shipping-orders.sql'),
    ('public.orders','shipping_tariff_version','^text$',false,'supabase-weight-shipping-orders.sql'),
    ('public.orders','total_weight_kg','^numeric\(16,3\)$',false,'supabase-weight-shipping-orders.sql'),
    ('public.orders','chargeable_weight_kg','^numeric\(16,3\)$',false,'supabase-weight-shipping-orders.sql'),
    ('public.orders','tariff_max_weight_kg','^numeric$',false,'supabase-weight-shipping-orders.sql'),
    ('public.orders','stock_restored_at','^timestamp with time zone$',false,'supabase-admin-orders.sql'),
    ('public.order_items','id','^uuid$',true,'supabase-orders.sql'),
    ('public.order_items','order_id','^uuid$',true,'supabase-orders.sql'),
    ('public.order_items','product_id','^text$',true,'supabase-orders.sql'),
    ('public.order_items','product_name','^text$',true,'supabase-orders.sql'),
    ('public.order_items','product_image','^text$',false,'supabase-orders.sql'),
    ('public.order_items','unit_price','^numeric\(12,2\)$',true,'supabase-orders.sql'),
    ('public.order_items','line_total','^numeric\(12,2\)$',true,'supabase-orders.sql'),
    ('public.order_items','quantity','^integer$',true,'supabase-orders.sql'),
    ('public.order_items','weight_kg','^numeric\(12,3\)$',false,'supabase-weight-shipping-orders.sql'),
    ('public.order_items','free_delivery','^boolean$',false,'supabase-weight-shipping-orders.sql'),
    ('movio_private.admin_users','user_id','^uuid$',true,'supabase-admin-security.sql'),
    ('movio_private.admin_users','created_at','^timestamp with time zone$',true,'supabase-admin-security.sql'),
    ('auth.users','id','^uuid$',true,'Supabase Auth')
),
columns_actual AS (
 SELECT e.*,c.oid AS table_oid,a.attnum,a.attnotnull,
 pg_catalog.format_type(a.atttypid,a.atttypmod) AS actual_type,
 pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr
 FROM required_columns e LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(e.table_name)
 LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
),
required_functions(signature,function_name,return_type,definer,body_md5,source,arg_names,volatility,language_name) AS (VALUES
 ('public.movio_is_admin()','movio_is_admin','boolean',true,'3488569522782c49ed6f363d8a9118a9','supabase-admin-security.sql','','s','sql'),
    ('public.movio_admin_orders(integer)','movio_admin_orders','jsonb',true,'47a69b5bcac7e9cead2048e6fe961e5e','supabase-admin-orders.sql','p_offset','v','plpgsql'),
    ('public.movio_admin_order_status(uuid,text)','movio_admin_order_status','jsonb',true,'4c50ad8bc7e687f8a09e4a9fbbe0f364','supabase-admin-orders.sql','p_order_id,p_status','v','plpgsql'),
    ('public.movio_place_order(uuid,uuid,jsonb,jsonb,numeric,text)','movio_place_order','jsonb',true,'034fd16f802d39d1893c958acdd7f655','supabase-nationwide-free-shipping.sql','p_checkout_token,p_user_id,p_customer,p_items,p_delivery_cost,p_delivery_type','v','plpgsql'),
    ('public.movio_orders_updated_at()','movio_orders_updated_at','trigger',false,'0146fd32790ffdead7f8c61f46267c34','supabase-orders.sql','','v','plpgsql'),
    ('public.movio_place_order(uuid,uuid,jsonb,jsonb,numeric)','movio_place_order','jsonb',true,'eea52a140d971e9929b400932d92aec4','supabase-weight-shipping-orders.sql','p_checkout_token,p_user_id,p_customer,p_items,p_delivery_cost','v','plpgsql')
),
known_incompatible_bodies(signature,body_md5,source) AS (VALUES
 ('public.movio_place_order(uuid,uuid,jsonb,jsonb,numeric)','b52b6c03b3e784b193ef07803806b1f1','supabase-orders.sql'),
 ('public.movio_place_order(uuid,uuid,jsonb,jsonb,numeric,text)','019304367a5e04f9f6da709cc7697543','supabase-weight-shipping-orders.sql')
),
functions_actual AS (
 SELECT e.*,p.oid,p.proowner,p.prosecdef,p.proconfig,p.provolatile,p.pronargdefaults,
 p.proargnames,p.prorettype,l.lanname,p.proacl,
 pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(
 pg_catalog.regexp_replace(p.prosrc,'--[^'||chr(10)||']*','','g'),'[[:space:]]+',' ','g'))) AS actual_md5
 FROM required_functions e LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.signature)
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
),
policies AS (
 SELECT n.nspname||'.'||c.relname AS table_name,p.oid,p.polname,p.polcmd,p.polpermissive,p.polroles,
 pg_catalog.regexp_replace(pg_catalog.regexp_replace(lower(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'')),
 'public[.]|order_items[.]|[[:space:]]+as[[:space:]]+(uid|movio_is_admin)','','g'),'[[:space:]()]','','g') AS using_norm,
 pg_catalog.regexp_replace(pg_catalog.regexp_replace(lower(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'')),
 'public[.]|[[:space:]]+as[[:space:]]+movio_is_admin','','g'),'[[:space:]()]','','g') AS check_norm
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname||'.'||c.relname IN (SELECT name FROM required_tables)
),
expected_policies(table_name,policy_name,command,using_norm,check_norm) AS (VALUES
 ('public.orders','orders_read_own','r','user_id=selectauth.uid',''),
 ('public.order_items','order_items_read_own','r','existsselect1fromordersowhereo.id=order_idando.user_id=selectauth.uid',''),
 ('public.products','movio_admin_product_read','r','selectmovio_is_admin',''),
 ('public.products','movio_admin_product_insert','a','','selectmovio_is_admin'),
 ('public.products','movio_admin_product_update','w','selectmovio_is_admin','selectmovio_is_admin'),
 ('public.products','movio_admin_product_delete','d','selectmovio_is_admin','')),
required_keys(table_name,kind,columns_csv,target_table,delete_action) AS (VALUES
 ('public.products','p','id',NULL,NULL),
    ('public.orders','p','id',NULL,NULL),
    ('public.orders','u','order_number',NULL,NULL),
    ('public.orders','u','checkout_token',NULL,NULL),
    ('public.order_items','p','id',NULL,NULL),
    ('public.order_items','u','order_id,product_id',NULL,NULL),
    ('movio_private.admin_users','p','user_id',NULL,NULL),
    ('public.orders','f','user_id','auth.users','n'),
    ('public.order_items','f','order_id','public.orders','c'),
    ('movio_private.admin_users','f','user_id','auth.users','c')
),
constraints_actual AS (
 SELECT c.*,n.nspname||'.'||t.relname AS table_name,
 (SELECT string_agg(a.attname,',' ORDER BY x.pos) FROM unnest(c.conkey) WITH ORDINALITY x(num,pos)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.num) AS columns_csv,
 (SELECT string_agg(a.attname,',' ORDER BY x.pos) FROM unnest(c.confkey) WITH ORDINALITY x(num,pos)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=x.num) AS target_columns_csv,
 pg_catalog.regexp_replace(pg_catalog.regexp_replace(lower(pg_catalog.pg_get_expr(c.conbin,c.conrelid)),
 '::(text|numeric|integer|character varying)(\[\])?','','g'),'[[:space:]()]','','g') AS expression_norm
 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname||'.'||t.relname IN (SELECT name FROM required_tables)
),
required_checks(table_name,column_name,expression_norm) AS (VALUES
 ('public.products','weight_kg','weight_kgisnullorweight_kg>=0.001andweight_kg<=999999999.999'),
    ('public.products','discount_percent','discount_percent>=0anddiscount_percent<=100'),
    ('public.orders','subtotal','subtotal>=0'),
    ('public.orders','delivery_cost','delivery_cost>=0'),
    ('public.orders','total','total=subtotal+delivery_cost'),
    ('public.orders','payment_method','payment_method=''cash_on_delivery'''),
    ('public.orders','payment_status','payment_status=anyarray[''pending'',''paid'',''failed'',''cancelled'',''refunded'']'),
    ('public.orders','order_status','order_status=anyarray[''received'',''preparing'',''shipped'',''completed'',''cancelled'']'),
    ('public.orders','delivery_type','delivery_type=anyarray[''city'',''region'',''branch_pickup'',''village_highland'']'),
    ('public.orders','total_weight_kg','total_weight_kg>=0'),
    ('public.orders','chargeable_weight_kg','chargeable_weight_kg>=0'),
    ('public.order_items','unit_price','unit_price>0'),
    ('public.order_items','quantity','quantity>=1andquantity<=100'),
    ('public.order_items','line_total','line_total=unit_price*quantity'),
    ('public.order_items','weight_kg','weight_kg>0'),
    ('public.orders','first_name','lengthfirst_name>=1andlengthfirst_name<=80'),
    ('public.orders','last_name','lengthlast_name>=1andlengthlast_name<=80'),
    ('public.orders','phone','lengthphone>=7andlengthphone<=30'),
    ('public.orders','city','lengthcity>=1andlengthcity<=100'),
    ('public.orders','address','lengthaddress>=1andlengthaddress<=500'),
    ('public.orders','email','lengthemail<=254')
),
required_indexes(table_name,index_name,columns_csv,descending_csv) AS (VALUES
 ('public.orders','orders_user_created_idx','user_id,created_at','false,true'),
 ('public.order_items','order_items_order_idx','order_id','false')),
indexes_actual AS (
 SELECT i.*,n.nspname||'.'||t.relname AS table_name,idx.relname AS index_name,am.amname,
 (SELECT string_agg(a.attname,',' ORDER BY x.pos) FROM unnest(i.indkey) WITH ORDINALITY x(num,pos)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=x.num WHERE x.pos<=i.indnkeyatts) AS columns_csv,
 (SELECT string_agg(((x.flag & 1)=1)::text,',' ORDER BY x.pos) FROM unnest(i.indoption) WITH ORDINALITY x(flag,pos)) AS descending_csv
 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
 JOIN pg_catalog.pg_am am ON am.oid=idx.relam
 WHERE n.nspname||'.'||t.relname IN (SELECT name FROM required_tables)
),
checks(area,check_name,status,detail) AS (
 SELECT '01 Objects',name,CASE WHEN oid IS NOT NULL AND relkind='r' THEN 'PASS' ELSE 'FAIL' END,
 'Required ordinary table; source: '||source FROM relations
 UNION ALL SELECT '01 Objects','role '||name,
 CASE WHEN oid IS NULL OR (name<>'service_role' AND (rolsuper OR rolbypassrls)) THEN 'FAIL' ELSE 'PASS' END,
 'Browser roles must exist and cannot bypass RLS.' FROM roles
 UNION ALL SELECT '02 Columns',table_name||'.'||column_name,
 CASE WHEN attnum IS NULL OR actual_type !~ type_pattern OR (required_not_null IS TRUE AND NOT attnotnull)
 OR (required_not_null IS FALSE AND attnotnull) THEN 'FAIL' ELSE 'PASS' END,
 'Expected type '||type_pattern||'; actual='||coalesce(actual_type,'MISSING')||'; required NOT NULL='||
 coalesce(required_not_null::text,'not prescribed')||'; actual='||coalesce(attnotnull::text,'MISSING')||'; source: '||source
 FROM columns_actual
 UNION ALL SELECT '03 RLS',name||' enabled',CASE WHEN oid IS NOT NULL AND relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
 'RLS required for browser-facing and private MOVIO tables.' FROM relations WHERE name<>'auth.users'
 UNION ALL SELECT '03 RLS',e.table_name||'.'||e.policy_name,
 CASE WHEN p.oid IS NULL THEN 'FAIL' WHEN p.polcmd::text<>e.command OR NOT p.polpermissive OR p.using_norm<>e.using_norm
 OR p.check_norm<>e.check_norm OR p.polroles<>ARRAY[(SELECT oid FROM roles WHERE name='authenticated')]::oid[] THEN 'REVIEW' ELSE 'PASS' END,
 'Exact normalized predicates, authenticated-only roles and command must match. REVIEW requires private owner inspection.'
 FROM expected_policies e LEFT JOIN policies p ON p.table_name=e.table_name AND p.polname=e.policy_name
 UNION ALL SELECT '03 RLS','extra policy '||p.table_name||'.'||p.polname,
 CASE WHEN p.polpermissive AND p.table_name IN ('public.orders','public.order_items','movio_private.admin_users') THEN 'FAIL'
 WHEN p.polpermissive AND p.table_name='public.products' AND p.polcmd<>'r' THEN 'FAIL' ELSE 'REVIEW' END,
 'Extra permissive policies combine with OR; restrictive/read custom policies also require independent review.'
 FROM policies p WHERE NOT EXISTS (SELECT 1 FROM expected_policies e WHERE e.table_name=p.table_name AND e.policy_name=p.polname)
 UNION ALL SELECT '03 RLS','catalog SELECT policy for '||r.name,
 CASE WHEN r.oid IS NULL THEN 'FAIL' WHEN EXISTS (SELECT 1 FROM policies p WHERE p.table_name='public.products'
 AND p.polcmd IN ('r','*') AND p.polpermissive AND (0::oid=ANY(p.polroles) OR EXISTS (
 SELECT 1 FROM unnest(p.polroles) x(role_oid) WHERE CASE WHEN x.role_oid=0 THEN false
 ELSE pg_catalog.pg_has_role(r.oid,x.role_oid,'USAGE') END)))
 THEN 'REVIEW' ELSE 'FAIL' END,
 'SELECT policy must exist; metadata cannot guarantee its predicate exposes active products to ordinary shoppers.'
 FROM roles r WHERE r.name IN ('anon','authenticated')
 UNION ALL SELECT '04 Grants',r.name||' products access',
 CASE WHEN r.oid IS NULL OR t.oid IS NULL OR NOT pg_catalog.has_table_privilege(r.oid,t.oid,'SELECT') THEN 'FAIL'
 WHEN r.name='anon' AND (pg_catalog.has_any_column_privilege(r.oid,t.oid,'INSERT') OR pg_catalog.has_any_column_privilege(r.oid,t.oid,'UPDATE')
 OR pg_catalog.has_table_privilege(r.oid,t.oid,'DELETE')) THEN 'FAIL'
 WHEN r.name='authenticated' AND NOT (pg_catalog.has_table_privilege(r.oid,t.oid,'INSERT') AND pg_catalog.has_table_privilege(r.oid,t.oid,'UPDATE')
 AND pg_catalog.has_table_privilege(r.oid,t.oid,'DELETE')) THEN 'FAIL'
 WHEN r.name<>'service_role' AND (pg_catalog.has_table_privilege(r.oid,t.oid,'TRUNCATE') OR pg_catalog.has_any_column_privilege(r.oid,t.oid,'REFERENCES')
 OR pg_catalog.has_table_privilege(r.oid,t.oid,'TRIGGER')) THEN 'FAIL' ELSE 'PASS' END,
 'Anon SELECT only; authenticated SELECT/I/U/D guarded by Admin RLS; browser destructive grants forbidden. Inherited grants included.'
 FROM roles r CROSS JOIN relations t WHERE t.name='public.products'
 UNION ALL SELECT '04 Grants',r.name||' forbidden grants on '||t.name,
 CASE WHEN r.oid IS NULL OR t.oid IS NULL THEN 'FAIL'
 WHEN pg_catalog.has_any_column_privilege(r.oid,t.oid,'INSERT') OR pg_catalog.has_any_column_privilege(r.oid,t.oid,'UPDATE')
 OR pg_catalog.has_table_privilege(r.oid,t.oid,'DELETE') OR pg_catalog.has_table_privilege(r.oid,t.oid,'TRUNCATE')
 OR pg_catalog.has_any_column_privilege(r.oid,t.oid,'REFERENCES') OR pg_catalog.has_table_privilege(r.oid,t.oid,'TRIGGER')
 OR (r.name='anon' AND pg_catalog.has_any_column_privilege(r.oid,t.oid,'SELECT'))
 OR (t.name='movio_private.admin_users' AND pg_catalog.has_any_column_privilege(r.oid,t.oid,'SELECT')) THEN 'FAIL' ELSE 'PASS' END,
 'No direct browser order mutations, anonymous order reads, destructive grants or private allowlist access.'
 FROM roles r CROSS JOIN relations t WHERE r.name IN ('anon','authenticated')
 AND t.name IN ('public.orders','public.order_items','movio_private.admin_users')
 UNION ALL SELECT '04 Grants','authenticated capability columns hidden',
 CASE WHEN r.oid IS NULL OR t.oid IS NULL THEN 'FAIL' WHEN EXISTS (SELECT 1 FROM columns_actual c
 WHERE c.table_name=t.name AND c.column_name IN ('checkout_token','request_payload') AND c.attnum IS NOT NULL
 AND pg_catalog.has_column_privilege(r.oid,t.oid,c.attnum,'SELECT')) THEN 'FAIL' ELSE 'PASS' END,
 'checkout_token and request_payload must have no effective customer SELECT grants.'
 FROM roles r CROSS JOIN relations t WHERE r.name='authenticated' AND t.name='public.orders'
 UNION ALL SELECT '04 Grants','authenticated SELECT '||c.table_name||'.'||c.column_name,
 CASE WHEN r.oid IS NULL OR c.attnum IS NULL THEN 'FAIL'
 WHEN pg_catalog.has_column_privilege(r.oid,c.table_oid,c.attnum,'SELECT') THEN 'PASS' ELSE 'FAIL' END,
 'Customer history SELECT grant; separately protected by own-order RLS.' FROM roles r CROSS JOIN columns_actual c
 WHERE r.name='authenticated' AND c.table_name IN ('public.orders','public.order_items')
 AND c.column_name NOT IN ('checkout_token','request_payload','stock_restored_at')
 UNION ALL SELECT '04 Grants','service_role DML '||t.name,
 CASE WHEN r.oid IS NULL OR t.oid IS NULL THEN 'FAIL' WHEN pg_catalog.has_table_privilege(r.oid,t.oid,'SELECT')
 AND pg_catalog.has_table_privilege(r.oid,t.oid,'INSERT') AND pg_catalog.has_table_privilege(r.oid,t.oid,'UPDATE')
 AND pg_catalog.has_table_privilege(r.oid,t.oid,'DELETE')
 THEN 'PASS' ELSE 'FAIL' END,
 'Server table privileges required by the repository grants (definer owner is reviewed separately).'
 FROM roles r CROSS JOIN relations t WHERE r.name='service_role' AND t.name IN ('public.orders','public.order_items')
 UNION ALL SELECT '04 Grants','private schema access '||r.name,
 CASE WHEN r.oid IS NULL OR n.oid IS NULL THEN 'FAIL' WHEN pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE')
 OR pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') THEN 'FAIL' ELSE 'PASS' END,
 'Browser roles must not access movio_private.' FROM roles r LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='movio_private'
 WHERE r.name IN ('anon','authenticated')
 UNION ALL SELECT '04 Grants','public schema access '||r.name,
 CASE WHEN r.oid IS NULL OR n.oid IS NULL OR NOT pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') THEN 'FAIL'
 WHEN r.name<>'service_role' AND pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') THEN 'REVIEW' ELSE 'PASS' END,
 'API roles need public schema USAGE. Browser CREATE rights require owner review for additional function/view paths.'
 FROM roles r LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 UNION ALL SELECT '04 Grants','service_role bypass',CASE WHEN oid IS NOT NULL AND (rolbypassrls OR rolsuper) THEN 'PASS' ELSE 'FAIL' END,
 'Supabase server role must support the intended privileged path.' FROM roles WHERE name='service_role'
 UNION ALL SELECT '05 Functions',signature||' contract/security',
 CASE WHEN oid IS NULL THEN 'FAIL' WHEN prosecdef<>definer OR pg_catalog.format_type(prorettype,NULL)<>return_type
 OR lanname<>language_name OR provolatile::text<>volatility OR coalesce(array_to_string(proargnames,','),'')<>arg_names
 OR coalesce(proconfig,ARRAY[]::text[])<>ARRAY['search_path=""']::text[] OR (function_name='movio_admin_orders' AND pronargdefaults<>1)
 OR (function_name<>'movio_admin_orders' AND pronargdefaults<>0) THEN 'FAIL' ELSE 'PASS' END,
 'Named RPC arguments, return/language/volatility, SECURITY DEFINER and empty search_path; source: '||source FROM functions_actual
 UNION ALL SELECT '05 Functions','Supabase auth.uid() dependency',
 CASE WHEN p.oid IS NOT NULL AND p.prorettype=pg_catalog.to_regtype('uuid') THEN 'PASS' ELSE 'FAIL' END,
 'Required UUID-valued Auth helper used by Admin allowlist and own-order policies; not invoked.'
 FROM (VALUES (1)) d(x) LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure('auth.uid()')
 UNION ALL SELECT '05 Functions',signature||' body compatibility',
 CASE WHEN oid IS NULL THEN 'FAIL' WHEN actual_md5=body_md5 THEN 'PASS'
 WHEN EXISTS (SELECT 1 FROM known_incompatible_bodies old WHERE old.signature=functions_actual.signature AND old.body_md5=actual_md5) THEN 'FAIL' ELSE 'REVIEW' END,
 'Normalized body fingerprint compared with '||source||'; known old active checkout/weight-shipping bodies FAIL, other drift needs owner review.' FROM functions_actual
 UNION ALL SELECT '05 Functions',f.signature||' definer owner',
 CASE WHEN f.oid IS NULL THEN 'FAIL' WHEN f.definer AND NOT coalesce(o.rolsuper OR o.rolbypassrls,false) THEN 'REVIEW' ELSE 'PASS' END,
 'Owner must be trusted with required object rights and RLS behavior; no source or credentials returned.'
 FROM functions_actual f LEFT JOIN pg_catalog.pg_roles o ON o.oid=f.proowner
 UNION ALL SELECT '05 Functions',f.signature||' EXECUTE '||r.name,
 CASE WHEN f.oid IS NULL OR r.oid IS NULL THEN 'FAIL'
 WHEN r.name='service_role' AND f.function_name IN ('movio_admin_orders','movio_admin_order_status','movio_orders_updated_at') THEN 'PASS'
 WHEN pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')=
 (CASE WHEN f.function_name='movio_place_order' THEN r.name='service_role'
 WHEN f.function_name='movio_is_admin' THEN r.name IN ('authenticated','service_role')
 WHEN f.function_name IN ('movio_admin_orders','movio_admin_order_status') THEN r.name='authenticated' ELSE false END)
 THEN 'PASS' ELSE 'FAIL' END,
 'Effective PUBLIC/inherited grants checked. Privileged service_role execution on Admin/trigger functions is optional; browser grants remain restricted.'
 FROM functions_actual f CROSS JOIN roles r
 UNION ALL SELECT '05 Functions',f.signature||' PUBLIC EXECUTE',
 CASE WHEN f.oid IS NULL THEN 'FAIL' WHEN EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a
 WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
 'PUBLIC execution must be revoked.' FROM functions_actual f
 UNION ALL SELECT '05 Functions','extra MOVIO function '||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')','REVIEW',
 'Unexpected function/overload can bypass the intended contract; review code and grants privately.'
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'movio_%' AND NOT EXISTS (SELECT 1 FROM functions_actual f WHERE f.oid=p.oid)
 UNION ALL SELECT '06 Constraints',e.table_name||' '||e.kind||' ('||e.columns_csv||')',
 CASE WHEN EXISTS (SELECT 1 FROM constraints_actual c WHERE c.table_name=e.table_name AND c.contype::text=e.kind
 AND c.columns_csv=e.columns_csv AND c.convalidated AND NOT c.condeferrable AND (e.target_table IS NULL OR
 (c.confrelid=pg_catalog.to_regclass(e.target_table) AND c.target_columns_csv='id' AND c.confdeltype::text=e.delete_action))) THEN 'PASS' ELSE 'FAIL' END,
 'Validated immediate PK/UNIQUE/FK; target='||coalesce(e.target_table,'n/a')||'; deletion action='||coalesce(e.delete_action,'n/a') FROM required_keys e
 UNION ALL SELECT '06 Constraints',e.table_name||' CHECK '||e.column_name,
 CASE WHEN EXISTS (SELECT 1 FROM constraints_actual c WHERE c.table_name=e.table_name AND c.contype='c' AND c.convalidated
 AND c.expression_norm=e.expression_norm) THEN 'PASS' WHEN EXISTS (SELECT 1 FROM constraints_actual c
 WHERE c.table_name=e.table_name AND c.contype='c' AND c.convalidated AND e.column_name=ANY(SELECT a.attname FROM unnest(c.conkey) x(num)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.num)) THEN 'REVIEW' ELSE 'FAIL' END,
 'Exact normalized repository CHECK expected. REVIEW may be equivalent or weaker; inspect without publishing expressions.' FROM required_checks e
 UNION ALL SELECT '06 Constraints','additional CHECK '||c.table_name||'.'||c.conname,'REVIEW',
 'Custom/changed CHECK can reject otherwise valid checkout or free delivery; inspect compatibility privately.'
 FROM constraints_actual c WHERE c.contype='c' AND c.table_name<>'auth.users'
 AND NOT EXISTS (SELECT 1 FROM required_checks e WHERE e.table_name=c.table_name AND e.expression_norm=c.expression_norm)
 UNION ALL SELECT '06 Constraints','snapshot product physical FK',
 CASE WHEN EXISTS (SELECT 1 FROM constraints_actual c WHERE c.table_name='public.order_items' AND c.contype='f' AND c.columns_csv='product_id')
 THEN 'REVIEW' ELSE 'PASS' END,'Repository intentionally retains snapshots without a products FK; cascading deletion could erase history.'
 UNION ALL SELECT '07 Indexes',e.index_name,
 CASE WHEN EXISTS (SELECT 1 FROM indexes_actual i WHERE i.table_name=e.table_name AND i.index_name=e.index_name AND i.indisvalid AND i.indisready
 AND i.amname='btree' AND i.indpred IS NULL AND i.indexprs IS NULL AND i.columns_csv=e.columns_csv AND i.descending_csv=e.descending_csv)
 THEN 'PASS' ELSE 'FAIL' END,'Ready valid nonpartial btree on '||e.table_name||' ('||e.columns_csv||'); direction='||e.descending_csv FROM required_indexes e
 UNION ALL SELECT '07 Indexes','PK/UNIQUE backing indexes valid',
 CASE WHEN EXISTS (SELECT 1 FROM constraints_actual c LEFT JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
 WHERE c.contype IN ('p','u') AND (i.indexrelid IS NULL OR NOT i.indisunique OR NOT i.indisvalid OR NOT i.indisready)) THEN 'FAIL' ELSE 'PASS' END,
 'Present keys need unique/ready/valid indexes; missing keys are reported separately.'
 UNION ALL SELECT '08 Defaults','order sequence exists',CASE WHEN c.oid IS NOT NULL AND c.relkind='S' THEN 'PASS' ELSE 'FAIL' END,
 'movio_order_number_seq required; no sequence values read.' FROM (VALUES (1)) d(x)
 LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.movio_order_number_seq')
 UNION ALL SELECT '08 Defaults','order sequence definition',
 CASE WHEN s.seqrelid IS NULL THEN 'FAIL' WHEN s.seqstart=100000 AND s.seqincrement=1 AND NOT s.seqcycle THEN 'PASS' ELSE 'REVIEW' END,
 'Repository sequence starts at 100000, increments by one and never cycles. Current counter is not read.'
 FROM (VALUES (1)) d(x) LEFT JOIN pg_catalog.pg_sequence s ON s.seqrelid=pg_catalog.to_regclass('public.movio_order_number_seq')
 UNION ALL SELECT '08 Defaults','sequence grants '||r.name,
 CASE WHEN r.oid IS NULL OR c.oid IS NULL THEN 'FAIL'
 WHEN r.name='service_role' AND pg_catalog.has_sequence_privilege(r.oid,c.oid,'USAGE') AND pg_catalog.has_sequence_privilege(r.oid,c.oid,'SELECT') THEN 'PASS'
 WHEN r.name<>'service_role' AND NOT (pg_catalog.has_sequence_privilege(r.oid,c.oid,'USAGE') OR pg_catalog.has_sequence_privilege(r.oid,c.oid,'SELECT')
 OR pg_catalog.has_sequence_privilege(r.oid,c.oid,'UPDATE')) THEN 'PASS' ELSE 'FAIL' END,
 'Server can use the sequence; browser roles cannot read/advance it.' FROM roles r
 LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.movio_order_number_seq') AND c.relkind='S'
 UNION ALL SELECT '08 Defaults','order number generation',
 CASE WHEN default_expr LIKE '%nextval(%movio_order_number_seq%' AND default_expr LIKE '%MOVIO-%' THEN 'PASS' ELSE 'FAIL' END,
 'Default must use MOVIO prefix and order sequence; expression not printed.' FROM columns_actual WHERE table_name='public.orders' AND column_name='order_number'
 UNION ALL SELECT '08 Defaults',table_name||'.'||column_name||' default',
 CASE WHEN (column_name='id' AND default_expr IN ('gen_random_uuid()','extensions.gen_random_uuid()'))
 OR (column_name IN ('created_at','updated_at') AND default_expr='now()') OR (column_name IN ('free_delivery','discount_visible') AND default_expr='false')
 OR (column_name='payment_status' AND default_expr LIKE '''pending''%') OR (column_name='order_status' AND default_expr LIKE '''received''%')
 OR (column_name='discount_percent' AND default_expr ~ '^0(::numeric)?$') OR (column_name='specifications' AND default_expr='''[]''::jsonb')
 OR (column_name='delivery_information' AND default_expr='''''::text') THEN 'PASS' ELSE 'REVIEW' END,
 'Missing/custom defaults may break omitted RPC/Admin fields; review before release.' FROM columns_actual
 WHERE (table_name IN ('public.orders','public.order_items') AND column_name='id')
 OR (table_name IN ('public.orders','movio_private.admin_users') AND column_name IN ('created_at','updated_at'))
 OR (table_name='public.orders' AND column_name IN ('payment_status','order_status','delivery_information'))
 OR (table_name='public.products' AND column_name IN ('free_delivery','discount_visible','discount_percent','specifications'))
 UNION ALL SELECT '08 Defaults','orders_updated_at trigger',
 CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=pg_catalog.to_regclass('public.orders')
 AND t.tgname='orders_updated_at' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND t.tgtype=19
 AND t.tgfoid=pg_catalog.to_regprocedure('public.movio_orders_updated_at()') AND t.tgqual IS NULL) THEN 'PASS' ELSE 'FAIL' END,
 'Enabled unconditional BEFORE ROW timestamp trigger points to repository function.'
 UNION ALL SELECT '09 Review','extra trigger '||r.name||'.'||t.tgname,'REVIEW',
 'Custom enabled trigger can alter totals/inventory/persistence; review privately.' FROM relations r
 JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal AND t.tgenabled<>'D'
 AND NOT (r.name='public.orders' AND t.tgname='orders_updated_at') AND r.name<>'auth.users'
 UNION ALL SELECT '09 Review','extra public SECURITY DEFINER '||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')','REVIEW',
 'Additional privileged mutation path may exist; review source/grants privately.' FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef
 AND NOT EXISTS (SELECT 1 FROM functions_actual f WHERE f.oid=p.oid)
 UNION ALL SELECT '09 Review','browser-readable public view '||c.relname,'REVIEW',
 'Views/materialized views can expose rows through another access path; verify ownership, security_invoker options and grants privately.'
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('v','m') AND EXISTS (SELECT 1 FROM roles r
 WHERE r.name IN ('anon','authenticated') AND r.oid IS NOT NULL AND pg_catalog.has_any_column_privilege(r.oid,c.oid,'SELECT'))
 UNION ALL SELECT '09 Review','SQL Editor identity',CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles
 WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN 'PASS' ELSE 'REVIEW' END,
 'Run as trusted owner with full metadata visibility; this does not emulate browser RLS.'
 UNION ALL SELECT '09 Review','migration compatibility','REVIEW',
 'Failures identify missing/incompatible migration effects. Function drift may mean wrong order: nationwide-free-shipping must be last. No migration history read.'
 UNION ALL SELECT '09 Review','runtime/data checks outstanding','REVIEW',
 'Metadata cannot prove allowlist membership, product completeness, persistence, rollback, concurrency, PostgREST cache, Auth/Turnstile or server configuration. Verify in authorized staging.'
)
SELECT area,check_name,status,detail FROM checks
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'REVIEW' THEN 1 ELSE 2 END,area,check_name;
