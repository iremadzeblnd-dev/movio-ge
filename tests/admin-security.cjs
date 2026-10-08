// Static SQL review and isolated JavaScript execution only; never executes SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(name, 'utf8');
const sql = read('supabase-admin-security.sql');
for (const file of ['admin-auth.js','admin.js','admin.html']) {
 assert(!/localDemoHost|local-demo-only|LOCAL DEMO|დემო რეჟიმი|location\.hostname/.test(read(file)),file);
}
assert.match(read('admin.html'), /#adminPanel:not\(\[data-authorized="true"\]\)/);
assert.match(sql, /user_id uuid primary key references auth.users\(id\)/);
assert.match(sql, /revoke all on table movio_private.admin_users from public, anon, authenticated/);
assert.match(sql, /security definer set search_path = ''/);
assert.match(sql, /a.user_id = auth.uid\(\)/);
assert(!/user_metadata|email|insert into movio_private.admin_users/i.test(sql));
assert.match(sql, /polcmd in \('\*','a','w','d'\)/);
assert.match(sql, /pg_get_expr\(p.polqual, p.polrelid\)/, 'ALL policy read predicates preserved');
assert.match(sql, /revoke insert, update, delete, truncate, references, trigger on public.products from public, anon, authenticated/);
for (const op of ['insert','update','delete']) assert.match(sql, new RegExp(`movio_admin_product_${op} on public.products for ${op} to authenticated`));
assert.equal((sql.match(/with check \(\(select public.movio_is_admin\(\)\)\)/g)||[]).length, 2);
assert.equal((sql.match(/using \(\(select public.movio_is_admin\(\)\)\)/g)||[]).length, 3);
assert(!/on public.orders|on public.order_items/.test(sql), 'Order RLS untouched');
const nodes = new Map();
function node(id) { if (!nodes.has(id)) nodes.set(id,{hidden:false,textContent:'',value:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},listeners:{},addEventListener(k,f){this.listeners[k]=f}}); return nodes.get(id); }
let session = null, allow = false, fail = false, callback, rpcCalls = 0;
const client = {auth:{getSession:async()=>({data:{session}}),onAuthStateChange:f=>{callback=f},signOut:async()=>{session=null;callback('SIGNED_OUT',null)},signInWithPassword:async()=>({})},rpc:async name=>{assert.equal(name,'movio_is_admin');rpcCalls++;return fail?{error:{message:'denied'}}:{data:allow}}};
const context = {window:{movioSupabase:client},document:{getElementById:node,querySelectorAll:()=>[node('logout')]},setTimeout,console};
vm.createContext(context);
const settle = () => new Promise(r=>setTimeout(r,20));
(async()=>{
 vm.runInContext(read('admin-auth.js'),context); await settle();
 assert.equal(node('adminPanel').hidden,true);assert.equal(rpcCalls,0);
 session={user:{id:'customer',user_metadata:{admin:true,role:'admin'}}};callback('SIGNED_IN',session);await settle();
 assert.equal(context.window.movioAdminAuthorized,false);assert.equal(node('adminPanel').hidden,true);
 allow=true;session={user:{id:'authorized-admin'}};callback('SIGNED_IN',session);await settle();
 assert.equal(node('adminPanel').hidden,false);assert.equal(context.window.movioAdminAuthorized,true);
 fail=true;callback('TOKEN_REFRESHED',session);assert.equal(node('adminPanel').hidden,true);await settle();
 assert.equal(context.window.movioAdminAuthorized,false);
 fail=false;callback('SIGNED_IN',session);await settle();const loggingOut=node('logout').listeners.click();
 assert.equal(node('adminPanel').hidden,true,'Logout hides dashboard synchronously');
 await loggingOut;await settle();
 assert.equal(context.window.movioAdminAuthorized,false);assert.equal(node('adminPanel').hidden,true);
 const sync=read('supabase-sync.js');assert.match(sync,/function requireAdmin\(\)[\s\S]*?movioAdminAuthorized !== true/);
 assert.match(sync,/saveProduct = function \(product\) \{\s*requireAdmin\(\)/);
 assert.match(sync,/deleteProduct = function \(id\) \{\s*requireAdmin\(\)/);
 for(const name of ['index.html','cart.html']) {
   const html=read(name);assert(html.includes('© 2026 MOVIO. ყველა უფლება დაცულია.'));
   assert(!/დემო შეკვეთის შექმნა|mock checkout|fake order|prototype/i.test(html));
 }
 console.log('PASS Admin security: guests/customer metadata denied, allowlisted Admin allowed, RPC failures fail closed, refresh/logout revoke UI, product write guards, RLS/grants static review, footer; NO SQL executed');
})().catch(error=>{console.error(error);process.exitCode=1});
