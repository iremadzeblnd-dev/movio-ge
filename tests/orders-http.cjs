// Real Node HTTP endpoint + real Vercel handler; simulated backend, no SQL/network.
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {createServer}=require('../scripts/dev-server.cjs');
const {server,products,receipts}=createServer({offline:true});
const send=(url,body,headers={})=>new Promise((resolve,reject)=>{
  const raw=JSON.stringify(body);const req=http.request(url,{method:'POST',headers:{'content-type':'application/json',origin:`http://127.0.0.1:${server.address().port}`,...headers}},res=>{
    let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
  });req.on('error',reject);req.end(raw);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/api/orders`;
  const input=()=>({checkoutToken:randomUUID(),deliveryRule:'weight_tariff_v1',deliveryType:'city',paymentMethod:'cash_on_delivery',turnstileToken:'offline-captcha',customer:{firstName:'First',lastName:'Last',phone:'+995555123456',city:'Tbilisi',address:'Street 1',email:''},items:[{id:'local-paid',quantity:2,expectedPrice:25.5,expectedWeightKg:10,expectedFreeDelivery:false}]});
  const guest=input();const result=await send(url,guest);assert.equal(result.status,200);assert.equal(result.body.total,70);
  const retries=await Promise.all([send(url,guest),send(url,guest)]);for(const r of retries)assert.deepEqual(r.body,result.body);
  assert.equal(products['local-paid'].stock,8);assert.equal(receipts.size,1);
  const auth=input();auth.items=[{id:'local-free',quantity:1,expectedPrice:50,expectedWeightKg:null,expectedFreeDelivery:true}];
  const free=await send(url,auth,{authorization:'Bearer offline-customer'});assert.equal(free.status,200);assert.equal(free.body.deliveryCost,0);
  const before=products['local-paid'].stock;
  const forged=input();forged.items[0].expectedFreeDelivery=true;
  assert.equal((await send(url,forged)).status,409);assert.equal(products['local-paid'].stock,before);
  assert.equal((await send(url,input(),{authorization:'Bearer bad'})).status,401);
  assert.equal((await send(url,input(),{origin:'https://evil.invalid'})).status,403);
  assert.equal((await send(url,{...input(),customer:{firstName:' ',lastName:'X',phone:'bad',city:' ',address:' '}})).status,400);
  assert.equal((await send(url,{...input(),checkoutToken:guest.checkoutToken})).status,200);
  const backendFetch=global.fetch;
  // Corrupt only the response after the fake database commits stock and receipt.
  let corruptNextRpc=true;
  global.fetch=async(...args)=>{
    const response=await backendFetch(...args);
    if(args[0].endsWith('/rpc/movio_place_order')&&corruptNextRpc){
      corruptNextRpc=false;
      return {...response,json:async()=>{throw new SyntaxError('Truncated response after commit')}};
    }
    return response;
  };
  const uncertain=input(), countBefore=receipts.size, stockBefore=products['local-paid'].stock;
  const malformed=await send(url,uncertain);assert.equal(malformed.status,503);
  assert.equal(receipts.size,countBefore+1);assert.equal(products['local-paid'].stock,stockBefore-2);
  const recovered=await Promise.all([send(url,uncertain),send(url,uncertain)]);
  for(const receipt of recovered){assert.equal(receipt.status,200);assert.equal(receipt.body.id,receipts.get(uncertain.checkoutToken).receipt.id);}
  assert.equal(receipts.size,countBefore+1,'Same-token retries create exactly one mocked order');
  assert.equal(products['local-paid'].stock,stockBefore-2,'Retries do not deduct stock again');
  const changed={...uncertain,items:[{...uncertain.items[0],quantity:1}]};
  assert.equal((await send(url,changed)).status,409,'Same token cannot change committed payload');
  global.fetch=backendFetch;
  console.log('PASS real local HTTP/Vercel handler: guest/Auth, free shipping, concurrent retries, mocked stock once, forged price/free flag denial, origins/auth/input checks; NO real orders or SQL');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
