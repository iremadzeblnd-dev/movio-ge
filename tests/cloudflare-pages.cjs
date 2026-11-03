const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const orders=require('../api/orders.js'),account=require('../api/customer-account.js');
(async()=>{
 const {runApi}=await import('../cloudflare/bridge.mjs');
 const env={SUPABASE_URL:'https://pages-db.invalid',SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret',TURNSTILE_SITE_KEY:'test-site',TURNSTILE_SECRET_KEY:'test-turnstile-secret',ORDER_ALLOWED_ORIGINS:'https://movio-test.pages.dev'};
 const before=process.env.SUPABASE_SERVICE_ROLE_KEY;
 let calls=[],mode='success';
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 global.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return json({id:'11111111-1111-4111-8111-111111111111'});
  if(url.includes('/turnstile/'))return json({success:mode!=='captcha-fail',action:'checkout',hostname:'movio-test.pages.dev'});
  if(url.endsWith('/rpc/movio_place_order')){
   assert.equal(options.headers.Authorization,'Bearer test-server-secret');
   assert.equal(JSON.parse(options.body).p_delivery_cost,null,'Client return estimate never becomes order delivery charge');
   return json({id:'test-order',number:'MOVIO-100001',subtotal:100,deliveryCost:6.5,total:106.5});
  }
  throw Error('Unexpected request');
 };
 const payload={checkoutToken:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer:{firstName:'Test',lastName:'Customer',phone:'+995555123456',city:'Test city',address:'Test street',email:''},paymentMethod:'cash_on_delivery',deliveryRule:'weight_tariff_v1',deliveryType:'city',items:[{id:'test',quantity:1,expectedPrice:100,expectedWeightKg:1,expectedFreeDelivery:false}],turnstileToken:'test-captcha'};
 const request=(body=payload,extra={})=>new Request('https://movio-test.pages.dev/api/orders',{method:'POST',headers:{Origin:env.ORDER_ALLOWED_ORIGINS,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 let response=await runApi(orders,new Request('https://movio-test.pages.dev/api/orders'),env);
 assert.equal(response.status,200);assert.equal((await response.json()).siteKey,'test-site');
 response=await runApi(orders,request(),env);assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{id:'test-order',number:'MOVIO-100001',subtotal:100,deliveryCost:6.5,total:106.5});
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 response=await runApi(orders,request(payload,{Authorization:'Bearer test-session'}),env);assert.equal(response.status,200);
 assert.equal(JSON.parse(calls.at(-1).options.body).p_user_id,'11111111-1111-4111-8111-111111111111');
 calls=[];response=await runApi(orders,request(payload,{Origin:'https://evil.invalid'}),env);assert.equal(response.status,403);assert.equal(calls.length,0);
 mode='captcha-fail';response=await runApi(orders,request(),env);assert.equal(response.status,403);assert(!calls.some(call=>call.url.endsWith('/rpc/movio_place_order')));mode='success';
 response=await runApi(orders,request({huge:'x'.repeat(21000)}),env);assert.equal(response.status,413);
 calls=[];response=await runApi(account,request(),env,4096);assert.equal(response.status,503);assert.equal(calls.length,0,'Disabled deletion stays disabled');
 response=await runApi(orders,request(),{});assert.equal(response.status,503);
 assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY,before,'Request bindings never mutate global Node environment');
 const output=path.resolve('dist-cloudflare');
 const assets=fs.readdirSync('.',{withFileTypes:true}).filter(entry=>entry.isFile()&&/\.(?:html|css|js|svg|png|jpe?g|webp|ico)$/i.test(entry.name)&&!/^preview.*\.png$/i.test(entry.name));
 for(const entry of assets)assert(fs.readFileSync(path.join(output,entry.name)).equals(fs.readFileSync(entry.name)),'Stale asset: '+entry.name);
 for(const name of fs.readdirSync(output)){
  assert(!fs.statSync(path.join(output,name)).isDirectory(),'No server or private directories in public output');
  assert(!/\.(?:sql|md|env|toml|jsonc)$|^\./i.test(name));
  assert(!/test-server-secret|test-turnstile-secret|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY/.test(fs.readFileSync(path.join(output,name),'utf8')),'No privileged values or server handlers in public output');
 }
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'_routes.json'))),{version:1,include:['/api/*'],exclude:[]});
 console.log('PASS Pages: exact complete static assets; no private/server artifacts; real handler bridge guest/Auth checkout, origin/captcha denial, size limit, missing bindings fail closed, disabled deletion, request-scoped secrets; no production writes');
})().catch(error=>{console.error(error);process.exitCode=1});
