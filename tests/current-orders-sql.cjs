// Executes repository migrations only in disposable in-memory PostgreSQL.
// No network access, production credentials, or production records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(process.env.MOVIO_PGLITE_PATH || path.join(os.tmpdir(), 'movio-order-sql-check/node_modules/@electric-sql/pglite'));
(async () => {
  const db = new PGlite();
  try {
    const admin = '11111111-1111-4111-8111-111111111111';
    const buyer = '22222222-2222-4222-8222-222222222222';
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table public.products(id text primary key,name text,image text,price numeric,stock integer,
        stock_status text,active boolean,updated_at timestamptz);
      grant select on products to anon,authenticated;
      alter table products enable row level security;
      create policy catalog_read on products for select to anon,authenticated using (active);
      insert into auth.users values ('${admin}'),('${buyer}');
      insert into products values ('free','Free scooter',null,2299,4,'მარაგშია',true,now()),
        ('paid','Paid delivery',null,10,10,'მარაგშია',true,now()),
        ('inactive','Removed',null,20,4,'მარაგშია',false,now());`);
    for (const file of ['supabase-orders.sql','supabase-product-delivery.sql','supabase-weight-shipping-orders.sql',
      'supabase-admin-security.sql','supabase-admin-orders.sql','supabase-nationwide-free-shipping.sql']) {
      await db.exec(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    }
    await db.exec(`insert into movio_private.admin_users(user_id) values ('${admin}');
      update products set free_delivery=true where id='free';
      update products set weight_kg=1 where id in ('paid','inactive');`);
    const customer = {firstName:'Test',lastName:'Buyer',phone:'+995555123456',city:'Test',address:'Test 1'};
    const free = {id:'free',quantity:1,expectedPrice:2299,expectedWeightKg:null,expectedFreeDelivery:true};
    const paid = {id:'paid',quantity:1,expectedPrice:10,expectedWeightKg:1,expectedFreeDelivery:false};
    const call = async (token, user, items, type='city', cost=999) => (await db.query(
      'select movio_place_order($1,$2,$3::jsonb,$4::jsonb,$5,$6) as receipt',
      [token,user,JSON.stringify(customer),JSON.stringify(items),cost,type])).rows[0].receipt;
    const token = randomUUID();
    const guest = await call(token,null,[free],'village_highland');
    assert.equal(guest.total,2299); assert.equal(guest.deliveryCost,0);
    // The stored retry receipt omits extra shipping metadata but retains identity/totals.
    const retry = await call(token,null,[free],'village_highland');
    for (const key of ['id','number','total','subtotal','deliveryCost']) assert.equal(retry[key],guest[key]);
    await assert.rejects(() => call(token,buyer,[free],'village_highland'), /CHECKOUT_CONFLICT/);
    const own = await call(randomUUID(),buyer,[free,paid],'region');
    assert.equal(own.subtotal,2309); assert.equal(own.deliveryCost,10.5); assert.equal(own.total,2319.5);
    assert.equal((await db.query('select count(*)::int n from order_items')).rows[0].n,3);
    const before = (await db.query("select stock from products where id='free'")).rows[0].stock;
    const orderCount = (await db.query('select count(*)::int n from orders')).rows[0].n;
    // Force a failure after the first item/stock write in the current RPC.
    await db.exec(`create function test_checkout_failure() returns trigger language plpgsql as $$
      begin if new.product_id='paid' then raise exception 'INJECTED_FAILURE'; end if; return new; end; $$;
      create trigger test_checkout_failure before insert on order_items for each row execute function test_checkout_failure();`);
    await assert.rejects(() => call(randomUUID(),buyer,[free,paid]), /INJECTED_FAILURE/);
    assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,orderCount);
    assert.equal((await db.query('select count(*)::int n from order_items')).rows[0].n,3);
    assert.equal((await db.query("select stock from products where id='free'")).rows[0].stock,before);
    await db.exec('drop trigger test_checkout_failure on order_items; drop function test_checkout_failure();');
    await assert.rejects(() => call(randomUUID(),buyer,[free,{...paid,quantity:100}]), /STOCK_UNAVAILABLE/);
    assert.equal((await db.query("select stock from products where id='free'")).rows[0].stock,before);
    await assert.rejects(() => call(randomUUID(),null,[{...paid,id:'missing'}]), /PRODUCT_UNAVAILABLE/);
    await assert.rejects(() => call(randomUUID(),null,[{...paid,id:'inactive',expectedPrice:20}]), /STOCK_UNAVAILABLE/);
    await assert.rejects(() => db.query('select movio_place_order($1,$2,$3::jsonb,$4::jsonb,$5)',
      [randomUUID(),null,JSON.stringify(customer),JSON.stringify([paid]),0]), /CHECKOUT_VERSION_UNSUPPORTED/);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${buyer}',false);`);
    assert.equal((await db.query('select id from orders')).rows.length,1);
    assert.equal((await db.query('select id from order_items')).rows.length,2);
    await assert.rejects(() => db.query('select checkout_token from orders'), /permission denied/);
    await assert.rejects(() => db.query('select movio_admin_orders(0)'), /ADMIN_REQUIRED/);
    await assert.rejects(() => db.query("insert into products(id) values ('forbidden')"), /row-level security/);
    assert.equal((await db.query("update products set stock=100 where id='paid' returning id")).rows.length,0,'Customer cannot overwrite stock');
    assert.equal((await db.query("delete from products where id='paid' returning id")).rows.length,0,'Customer cannot delete products');
    await assert.rejects(() => db.query("update orders set total=0"), /permission denied/);
    await assert.rejects(() => db.query("delete from order_items"), /permission denied/);
    await assert.rejects(() => call(randomUUID(),buyer,[paid]), /permission denied/);
    await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);`);
    assert.equal((await db.query('select id from orders')).rows.length,0,'Other customer history remains isolated even for allowlisted Admin direct SELECT');
    assert.equal((await db.query('select movio_is_admin() as ok')).rows[0].ok,true);
    assert.equal((await db.query('select movio_admin_orders(0) as orders')).rows[0].orders.length,2);
    // Soft removal must not prevent stock restoration or reactivate the product.
    await db.exec("update products set active=false where id='free'");
    await db.query('select movio_admin_order_status($1,$2)',[own.id,'cancelled']);
    await db.query('select movio_admin_order_status($1,$2)',[own.id,'cancelled']);
    await assert.rejects(() => db.query('select movio_admin_order_status($1,$2)',[own.id,'received']), /ORDER_TERMINAL/);
    const restored = (await db.query("select stock,active from products where id='free'")).rows[0];
    assert.equal(restored.stock,before+1); assert.equal(restored.active,false);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => db.query('select id from orders'), /permission denied/);
    await assert.rejects(() => db.query('select movio_is_admin()'), /permission denied/);
    await db.exec('reset role; set role service_role');
    const serviceRetry=await call(token,null,[free],'village_highland');
    assert.equal(serviceRetry.id,guest.id,'Actual service role can recover the same receipt after deactivation');
    await db.exec('reset role');
    assert.equal((await db.query("select stock from products where id='free'")).rows[0].stock,before+1,'Receipt recovery never reserves stock again');
    console.log('PASS current migration chain in isolated PostgreSQL: guest/Auth persistence, server totals, nationwide free/mixed shipping, retries, rollback, deleted products, customer RLS, Admin authorization/cancellation and exactly-once restocking. Production and multi-connection concurrency NOT tested.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
