const assert=require('node:assert/strict'),handler=require('../api/orders.js'),shipping=require('../shipping.js');
Object.assign(process.env,{SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-test',SUPABASE_PUBLISHABLE_KEY:'public-test',TURNSTILE_SECRET_KEY:'captcha-test',TURNSTILE_SITE_KEY:'site-test',ORDER_ALLOWED_ORIGINS:'https://movio.example'});
const originalFetch=global.fetch,originalWarn=console.warn,diagnostics=[],products={a:{price:25.5,weightKg:45,freeDelivery:false,stock:10},b:{price:10,weightKg:10,freeDelivery:false,stock:10},free:{price:25.5,weightKg:45,freeDelivery:true,stock:10},heavy:{price:25.5,weightKg:600,freeDelivery:false,stock:10}};
console.warn=value=>diagnostics.push(JSON.parse(value));
let calls=[],authFailure=false,captchaFailure=false,dbGatewayFailure=false,rpcOverride,captchaOverride;
global.fetch=async(url,options={})=>{
 calls.push({url,options});if(url.endsWith('/auth/v1/user'))return {ok:!authFailure,json:async()=>({id:'11111111-1111-4111-8111-111111111111'})};
 if(url.includes('siteverify'))return captchaOverride || {ok:true,json:async()=>({success:!captchaFailure,action:'checkout',hostname:'movio.example'})};
 if(rpcOverride)return rpcOverride;
 if(dbGatewayFailure)return {ok:false,status:502,json:async()=>({message:'Upstream gateway failed'})};
 const p=JSON.parse(options.body);
 if(p.p_items.some(i=>!products[i.id]||products[i.id].active===false))return {ok:false,status:400,json:async()=>({message:'PRODUCT_UNAVAILABLE'})};
 const quote=shipping.quote(p.p_items.map(i=>({product:products[i.id],quantity:i.quantity})),p.p_delivery_type);
 const failure=p.p_items.some(i=>i.expectedPrice!==products[i.id].price)?'PRICE_CHANGED':p.p_items.some(i=>i.expectedWeightKg!==products[i.id].weightKg||i.expectedFreeDelivery!==products[i.id].freeDelivery)?'SHIPPING_DATA_CHANGED':p.p_items.some(i=>i.quantity>products[i.id].stock)?'STOCK_UNAVAILABLE':quote.error;
 const subtotal=p.p_items.reduce((sum,i)=>sum+products[i.id].price*i.quantity,0);
 return {ok:!failure,json:async()=>failure?{message:failure}:{id:'order-id',number:'MOVIO-100001',subtotal,deliveryCost:quote.deliveryCost,total:subtotal+quote.deliveryCost}};
};
const input=()=>({checkoutToken:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer:{firstName:'First',lastName:'Last',phone:'+995555123456',email:'',city:'Tbilisi',address:'Street'},paymentMethod:'cash_on_delivery',deliveryRule:'weight_tariff_v1',deliveryType:'city',items:[{id:'a',quantity:2,expectedPrice:25.5,expectedWeightKg:45,expectedFreeDelivery:false}],turnstileToken:'captcha',user_id:'spoof',subtotal:0,total:0,deliveryCost:0,payment_status:'paid'});
async function run(body=input(),headers={},method='POST'){calls=[];const res={setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method,headers:{origin:'https://movio.example','content-type':'application/json',...headers},body},res);return res;}
(async()=>{
 let r=await run();assert.equal(r.statusCode,200);assert.equal(r.body.deliveryCost,65);assert.equal(r.body.total,116);
 for (const invalid of [null,[],{...input(),items:[null]},{...input(),customer:{...input().customer,phone:'abc'}},{...input(),customer:{...input().customer,address:' '}},{...input(),customer:{...input().customer,firstName:' '}}]) {
   const rejected=await run(invalid);assert.equal(rejected.statusCode,400);assert.equal(calls.length,0);
 }
 r=await run();
 let p=JSON.parse(calls.at(-1).options.body);assert.equal(p.p_user_id,null);assert.equal(p.p_delivery_cost,null);assert(!('subtotal' in p));assert(!('total' in p));
 r=await run(input(),{authorization:'Bearer authenticated'});assert.equal(r.statusCode,200);assert.equal(JSON.parse(calls.at(-1).options.body).p_user_id,'11111111-1111-4111-8111-111111111111');
 authFailure=true;r=await run(input(),{authorization:'Bearer bad'});assert.equal(r.statusCode,401);assert.equal(calls.length,1);authFailure=false;
 captchaFailure=true;r=await run();assert.equal(r.statusCode,403);captchaFailure=false;
 for(const verified of [
   {success:'true',action:'checkout',hostname:'movio.example'},
   {success:'false',action:'checkout',hostname:'movio.example'},
   {success:true,action:'other-action',hostname:'movio.example'},
   {success:true,action:'checkout',hostname:'evil.invalid'},
   {success:false,'error-codes':['timeout-or-duplicate']},
 ]) {
   captchaOverride={ok:true,json:async()=>verified};r=await run();assert.equal(r.statusCode,403);
   assert(!calls.some(c=>c.url.endsWith('/rpc/movio_place_order')),'Failed Turnstile cannot reach checkout RPC');
 }
 captchaOverride={ok:true,json:async()=>{throw new SyntaxError('Malformed Siteverify');}};
 r=await run();assert.equal(r.statusCode,503);assert(!calls.some(c=>c.url.endsWith('/rpc/movio_place_order')));
 captchaOverride=undefined;
 for(const code of ['missing-input-secret','invalid-input-secret','bad-request','internal-error']){
   captchaOverride={ok:true,status:200,json:async()=>({success:false,'error-codes':[code,'sensitive-untrusted-value'],secret:'do-not-log',response:'do-not-log'})};
   r=await run();assert.equal(r.statusCode,503,'Configuration/provider failures cannot be repaired by retrying the widget');
   assert(!calls.some(c=>c.url.endsWith('/rpc/movio_place_order')));
   const logged=diagnostics.at(-1);assert.deepEqual(logged.errorCodes,[code,'unknown']);
   assert.deepEqual(Object.keys(logged).sort(),['errorCodes','event','httpStatus','reason']);
   assert(!JSON.stringify(logged).includes('do-not-log'));assert(!JSON.stringify(r.body).includes(code));
 }
 captchaOverride=undefined;
 r=await run({...input(),items:[{...input().items[0],id:'nonexistent-diagnostic-product'}]});
 assert.equal(r.statusCode,409,'Missing products cannot create an order even after successful Turnstile verification');
 r=await run(input(),{origin:'https://evil.invalid'});assert.equal(r.statusCode,403);assert.equal(calls.length,0);
 r=await run({...input(),deliveryType:''});assert.equal(r.statusCode,400);assert.equal(calls.length,0);
 r=await run({...input(),deliveryType:'cheap'});assert.equal(r.statusCode,400);
 r=await run({...input(),deliveryCost:-100,p_delivery_cost:0,weight_kg:0,free_delivery:true,order_status:'completed'});assert.equal(r.body.total,116);
 p=JSON.parse(calls.at(-1).options.body);assert(!('weight_kg' in p));assert(!('free_delivery' in p));assert(!('order_status' in p));
 for(const overrides of [{expectedPrice:1},{expectedWeightKg:1},{expectedFreeDelivery:true}]){r=await run({...input(),items:[{...input().items[0],...overrides}]});assert.equal(r.statusCode,409);}
 r=await run({...input(),items:[{id:'free',quantity:2,expectedPrice:25.5,expectedWeightKg:45,expectedFreeDelivery:true}]});assert.equal(r.body.deliveryCost,0);
 products.free.weightKg=null;
 for(const deliveryType of shipping.types){
   r=await run({...input(),deliveryType,items:[{id:'free',quantity:2,expectedPrice:25.5,expectedWeightKg:null,expectedFreeDelivery:true}]});assert.equal(r.statusCode,200);assert.equal(r.body.deliveryCost,0);
 }
 r=await run({...input(),items:[{...input().items[0],expectedWeightKg:null,expectedFreeDelivery:true}]});assert.equal(r.statusCode,409,'Spoofing free delivery with no weight is rejected by authoritative server data');
 products.free.weightKg=45;
 r=await run({...input(),items:[input().items[0],{id:'b',quantity:1,expectedPrice:10,expectedWeightKg:10,expectedFreeDelivery:false}]});assert.equal(r.body.deliveryCost,65);assert.equal(r.body.total,126);
 r=await run({...input(),items:[input().items[0],{id:'free',quantity:1,expectedPrice:25.5,expectedWeightKg:45,expectedFreeDelivery:true}]});assert.equal(r.statusCode,200);assert.equal(r.body.deliveryCost,65);assert.equal(r.body.total,141.5);
 r=await run({...input(),items:[{id:'heavy',quantity:2,expectedPrice:25.5,expectedWeightKg:600,expectedFreeDelivery:false}]});assert.equal(r.statusCode,409);
 r=await run({...input(),items:[{...input().items[0],quantity:11}]});assert.equal(r.statusCode,409);
 products.a.active=false;r=await run();assert.equal(r.statusCode,409,'Deactivated products rejected by authoritative RPC response');products.a.active=true;
 r=await run({...input(),items:[{...input().items[0],id:'deleted'}]});assert.equal(r.statusCode,409,'Missing products rejected');
 r=await run(null,{},'GET');assert.deepEqual(r.body,{siteKey:'site-test',deliveryRule:'weight_tariff_v1'});
 const verificationCall=calls.find(c=>c.url.includes('siteverify'));
 // GET emits only public configuration; POST alone sends the secret to Siteverify.
 assert.equal(verificationCall,undefined);
 await run();assert.deepEqual(JSON.parse(calls.find(c=>c.url.includes('siteverify')).options.body),{secret:'captcha-test',response:'captcha'});
 dbGatewayFailure=true;r=await run();assert.equal(r.statusCode,503,'Uncertain RPC outcome retains checkout retry token');dbGatewayFailure=false;
 r=await run('{broken');assert.equal(r.statusCode,400);assert.equal(calls.length,0,'Malformed client JSON cannot reach RPC');
 for(const ok of [true,false]){
   rpcOverride={ok,status:ok?200:502,json:async()=>{throw new SyntaxError('Malformed upstream JSON')}};
   r=await run();assert.equal(r.statusCode,503,'Malformed upstream JSON is uncertain, never HTTP 400');
 }
 for(const malformed of [null,[],{},'html', {id:'x',number:'MOVIO-1',subtotal:1,deliveryCost:0,total:2},
   {id:'x',number:'MOVIO-1',subtotal:'1',deliveryCost:0,total:1}, {id:'x',number:'MOVIO-1',subtotal:1,deliveryCost:0,total:-1}]){
   rpcOverride={ok:true,status:200,json:async()=>malformed};r=await run();assert.equal(r.statusCode,503,'Invalid receipt remains uncertain');
 }
 rpcOverride={ok:false,status:400,json:async()=>({message:'toString'})};
 r=await run();assert.equal(r.statusCode,503,'Inherited properties are not known transactional errors');
 rpcOverride=undefined;
 for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY','TURNSTILE_SECRET_KEY','TURNSTILE_SITE_KEY','ORDER_ALLOWED_ORIGINS']){
   const value=process.env[name];delete process.env[name];
   try {
     for(const method of ['GET','POST']){r=await run(input(),{},method);assert.equal(r.statusCode,503,`${name}: missing configuration fails closed`);assert.equal(calls.length,0);}
   } finally {process.env[name]=value;}
 }
 console.log('PASS API: verified guest/auth identity, allowed delivery types, combined authoritative weight, ignored client cost/status/weight/free flags, price/weight/free tampering rejection, free/mixed/overweight/stock failures, server-only credentials');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch;console.warn=originalWarn});
