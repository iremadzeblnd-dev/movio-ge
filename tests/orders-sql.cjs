// Local PostgreSQL/WASM only. Install @electric-sql/pglite in a temporary directory.
// Run: $env:MOVIO_PGLITE_PATH="$env:TEMP/movio-order-sql-check/node_modules/@electric-sql/pglite"; node tests/orders-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
if (process.argv.includes('--static')) {
  const base = fs.readFileSync('supabase-orders.sql', 'utf8');
  const current = fs.readFileSync('supabase-nationwide-free-shipping.sql', 'utf8');
  const admin = fs.readFileSync('supabase-admin-orders.sql', 'utf8');
  assert.match(base, /checkout_token uuid not null unique/);
  assert.match(base, /total = subtotal \+ delivery_cost/);
  assert.match(base, /line_total = unit_price \* quantity/);
  assert.match(base, /using \(user_id = \(select auth.uid\(\)\)\)/);
  assert.match(base, /o.user_id = \(select auth.uid\(\)\)/);
  assert.match(current, /pg_advisory_xact_lock/);
  assert.match(current, /for update/);
  assert.match(current, /insert into public.orders/);
  assert.match(current, /insert into public.order_items/);
  assert.match(current, /stock = stock - quantity/);
  assert.match(current, /product.active is false/);
  assert.match(current, /if not found then raise exception 'PRODUCT_UNAVAILABLE'/);
  assert.match(current, /subtotal \+ delivery_cost/);
  assert.match(current, /revoke all on function public.movio_place_order\(uuid, uuid, jsonb, jsonb, numeric, text\) from public, anon, authenticated/);
  assert.match(current, /grant execute on function public.movio_place_order\(uuid, uuid, jsonb, jsonb, numeric, text\) to service_role/);
  assert.match(admin, /stock_restored_at is null/);
  console.log('PASS SQL static mode: current migrations reviewed for persistence, totals, ownership RLS, inventory, deleted products and RPC grants. PostgreSQL execution SKIPPED; no SQL executed.');
  return;
}
const { PGlite } = require(process.env.MOVIO_PGLITE_PATH || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
    create table public.products(id text primary key,name text,image text,price numeric,stock integer,
      stock_status text,active boolean,updated_at timestamptz);
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    insert into products values ('a','Original','a.jpg',25.50,10,'მარაგშია',true,now()),
      ('b','Second','b.jpg',10,5,'მარაგშია',true,now());`);
  await db.exec(fs.readFileSync('supabase-orders.sql','utf8').replace(/^\uFEFF/,''));
  const user = '11111111-1111-4111-8111-111111111111';
  const customer = { firstName:'First',lastName:'Last',phone:'+995555123456',email:'buyer@example.test',city:'Tbilisi',address:'Street 1' };
  const items = [{id:'a',quantity:2,expectedPrice:25.5},{id:'b',quantity:1,expectedPrice:10}];
  const call = async (token, uid, list=items, cost=5) => (await db.query(
    `select public.movio_place_order($1,$2,$3::jsonb,$4::jsonb,$5) as receipt`,
    [token,uid,JSON.stringify(customer),JSON.stringify(list),cost])).rows[0].receipt;
  const t1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const guest = await call(t1,null);
  assert.equal(guest.total,66); assert.equal(guest.subtotal,61); assert.match(guest.number,/^MOVIO-\d+$/);
  assert.deepEqual(await call(t1,null),guest,'Retry returns same order');
  await assert.rejects(()=>call(t1,user),/CHECKOUT_CONFLICT/);
  const t2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const own = await call(t2,user);
  const before = (await db.query('select count(*)::int as n from orders')).rows[0].n;
  await assert.rejects(()=>call('cccccccc-cccc-4ccc-8ccc-cccccccccccc',user,[{id:'a',quantity:1,expectedPrice:25.5},{id:'b',quantity:100,expectedPrice:10}]),/STOCK_UNAVAILABLE/);
  assert.equal((await db.query('select count(*)::int as n from orders')).rows[0].n,before);
  assert.equal((await db.query("select stock from products where id='a'")).rows[0].stock,6,'Failed multi-item order does not change stock');
  await assert.rejects(()=>call('dddddddd-dddd-4ddd-8ddd-dddddddddddd',user,[{id:'a',quantity:1,expectedPrice:1}]),/PRICE_CHANGED/);
  await assert.rejects(()=>call('dddddddd-dddd-4ddd-8ddd-dddddddddddd',user,[{id:'a',quantity:-1,expectedPrice:25.5}]),/INVALID_ITEMS/);
  await assert.rejects(()=>call('dddddddd-dddd-4ddd-8ddd-dddddddddddd',user,[items[0],items[0]]),/INVALID_ITEMS/);
  // Force a failure after the order and first item/stock write, proving rollback.
  await db.exec(`create function public.test_item_failure() returns trigger language plpgsql as $$
    begin if new.product_id = 'b' then raise exception 'TEST_ROLLBACK'; end if; return new; end; $$;
    create trigger test_item_failure before insert on order_items for each row execute function public.test_item_failure();`);
  await assert.rejects(()=>call('ffffffff-ffff-4fff-8fff-ffffffffffff',user),/TEST_ROLLBACK/);
  assert.equal((await db.query('select count(*)::int as n from orders')).rows[0].n,before);
  assert.equal((await db.query("select stock from products where id='a'")).rows[0].stock,6);
  await db.exec('drop trigger test_item_failure on order_items; drop function public.test_item_failure();');
  await db.exec(`update products set name='Edited',price=99,image='changed.jpg' where id='a'; delete from products where id='b';`);
  const snapshot=(await db.query('select product_name,unit_price,product_image from order_items where order_id=$1 and product_id=$2',[own.id,'a'])).rows[0];
  assert.deepEqual(snapshot,{product_name:'Original',unit_price:'25.50',product_image:'a.jpg'});
  assert.equal((await db.query("select count(*)::int as n from order_items where product_id='b'")).rows[0].n,2,'Deleted products preserve snapshots');
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  assert.deepEqual((await db.query('select id from orders')).rows.map(row=>row.id),[own.id]);
  assert.equal((await db.query('select * from order_items')).rows.length,2);
  await assert.rejects(()=>db.query('select checkout_token from orders'),/permission denied/);
  await assert.rejects(()=>db.query("update orders set total=1"),/permission denied/);
  await assert.rejects(()=>db.query("delete from order_items"),/permission denied/);
  await assert.rejects(()=>call('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',user),/permission denied/);
  await db.exec(`select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);`);
  assert.equal((await db.query('select id from orders')).rows.length,0);
  assert.equal((await db.query('select * from order_items')).rows.length,0);
  await db.exec('reset role; set role anon;');
  await assert.rejects(()=>db.query('select id from orders'),/permission denied/);
  await assert.rejects(()=>db.query('select * from order_items'),/permission denied/);
  await assert.rejects(()=>call('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',null),/permission denied/);
  await db.exec('reset role; set role service_role;');
  assert.deepEqual(await call(t1,null),guest,'Server role can recover receipt despite edited/deleted products');
  await db.close();
  console.log('PASS SQL: guest/auth orders, server-only RPC, own-order RLS, guest read denial, immutable snapshots, totals, stock rollback, retries, forbidden writes and capabilities');
})().catch(error=>{console.error(error);process.exitCode=1;});
