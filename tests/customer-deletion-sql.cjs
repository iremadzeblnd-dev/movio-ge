// Disposable PostgreSQL only; never connects to Supabase or deletes real accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {PGlite}=require(process.env.MOVIO_PGLITE_PATH||path.join(os.tmpdir(),'movio-order-sql-check/node_modules/@electric-sql/pglite'));
(async()=>{
  const db=new PGlite();
  const admin='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema movio_private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table movio_private.admin_users(user_id uuid primary key references auth.users(id) on delete cascade);
      create table public.orders(id integer primary key,user_id uuid references auth.users(id) on delete set null,request_payload jsonb,name text,total integer,status text);
      create table public.order_items(id integer primary key,order_id integer references orders(id) on delete cascade);
      insert into auth.users values('${admin}'),('${buyer}'),('${other}');
      insert into movio_private.admin_users values('${admin}');
      insert into orders values(1,'${buyer}','{"customer":{"address":"private"}}','Retained buyer',50,'shipped'),(2,'${other}','{"customer":{"address":"other"}}','Other buyer',75,'received');
      insert into order_items values(1,1),(2,2);grant usage on schema public,auth to authenticated,anon;`);
    await db.exec(fs.readFileSync('supabase-customer-account-deletion.sql','utf8'));
    const metadata = await db.query(fs.readFileSync('supabase-customer-deletion-check.sql','utf8'));
    assert(metadata.rows.length >= 19, 'Read-only production check covers functions, trigger and retention FK');
    assert.deepEqual(metadata.rows.filter(row => row.status !== 'PASS'), [], 'Expected migration passes metadata verification');
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${buyer}',false)`);
    assert.equal((await db.query('select movio_customer_deletion_check() allowed')).rows[0].allowed,true);
    await assert.rejects(()=>db.query('delete from auth.users'),/permission denied/);
    await db.exec(`reset role;insert into movio_private.admin_users values('${buyer}')`);
    await assert.rejects(()=>db.query('delete from auth.users where id=$1',[buyer]),/ADMIN_ACCOUNT_PROTECTED/,'Admin granted after preflight remains protected');
    await db.exec(`delete from movio_private.admin_users where user_id='${buyer}';set role authenticated`);
    await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
    assert.equal((await db.query('select movio_customer_deletion_check() allowed')).rows[0].allowed,false);
    await db.exec('reset role');
    await assert.rejects(()=>db.query('delete from auth.users where id=$1',[admin]),/ADMIN_ACCOUNT_PROTECTED/);
    assert.equal((await db.query('select count(*)::int n from movio_private.admin_users')).rows[0].n,1);
    await db.exec('alter table auth.users disable trigger movio_guard_customer_account_deletion');
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${buyer}',false)`);
    await assert.rejects(()=>db.query('select movio_customer_deletion_check()'),/ACCOUNT_DELETION_NOT_READY/);
    await db.exec('reset role;alter table auth.users enable trigger movio_guard_customer_account_deletion');
    // Refuse unsafe CASCADE schemas even when the same application endpoint is used.
    await db.exec('alter table orders drop constraint orders_user_id_fkey;alter table orders add constraint orders_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade');
    await assert.rejects(()=>db.query('delete from auth.users where id=$1',[buyer]),/RETENTION_NOT_READY/);
    await db.exec('alter table orders drop constraint orders_user_id_fkey;alter table orders add constraint orders_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null');
    await db.exec(`create function test_delete_failure() returns trigger language plpgsql as $$begin raise exception 'SIMULATED_AUTH_FAILURE';end;$$;
      create trigger test_delete_failure after delete on auth.users for each row execute function test_delete_failure()`);
    await assert.rejects(()=>db.query('delete from auth.users where id=$1',[buyer]),/SIMULATED_AUTH_FAILURE/);
    assert.deepEqual((await db.query('select request_payload from orders where id=1')).rows[0].request_payload,{customer:{address:'private'}},'Failed Auth deletion rolls back redaction');
    assert.equal((await db.query('select user_id from orders where id=1')).rows[0].user_id,buyer);
    await db.exec('drop trigger test_delete_failure on auth.users;drop function test_delete_failure()');
    await db.query('delete from auth.users where id=$1',[buyer]);
    const retained=(await db.query('select * from orders where id=1')).rows[0];
    assert.equal(retained.user_id,null);assert.equal(retained.name,'Retained buyer');assert.equal(retained.total,50);assert.equal(retained.status,'shipped');
    assert.deepEqual(retained.request_payload,{account_deleted:true});
    assert.equal((await db.query('select count(*)::int n from order_items')).rows[0].n,2);
    assert.deepEqual((await db.query('select request_payload from orders where id=2')).rows[0].request_payload,{customer:{address:'other'}});
    await db.exec(`set role anon`);await assert.rejects(()=>db.query('select movio_customer_deletion_check()'),/permission denied/);
    console.log('PASS isolated deletion SQL: self-check only, admin preserved, unsafe FK/disabled guard blocked, orders/items retained and detached, retry PII redacted, other customers unchanged');
  } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
