// Real checkout client in an isolated VM; all responses and storage are local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('orders.js','utf8');
const storage = new Map(), requests = [];
let responseMode, resetCount = 0;
const input = {customer:{firstName:'Test'},items:[{id:'test',quantity:1}],paymentMethod:'cash_on_delivery'};
function loadClient() {
  const window = {turnstile:{render:()=>0,getResponse:()=> 'mock-captcha',reset:()=>{resetCount++;}},
    movioSupabase:{auth:{getSession:async()=>({data:{session:null}})}}};
  vm.runInNewContext(source, {window, sessionStorage:{setItem:(k,v)=>storage.set(k,v)},
    fetch:async(_url, options)=>{
      if (!options?.method) return {ok:true,json:async()=>({siteKey:'mock',deliveryRule:'weight_tariff_v1'})};
      const sent = JSON.parse(options.body); requests.push(sent);
      assert.equal(JSON.parse(storage.get('movio-pending-checkout')).outcomeUncertain,true,'Persist uncertainty before POST');
      if (responseMode==='network') throw Error('Mock disconnected');
      if (responseMode==='bad-json') return {ok:true,json:async()=>{throw new SyntaxError('Mock truncated JSON');}};
      if (responseMode==='bad-receipt') return {ok:true,json:async()=>({total:-1})};
      if (typeof responseMode==='number') return {ok:false,status:responseMode,json:async()=>({error:'Mock rejection'})};
      return {ok:true,json:async()=>({id:'one-order',number:'MOVIO-100001',subtotal:10,deliveryCost:0,total:10})};
    }});
  return window.MovioOrders;
}
const fresh = () => ({token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',input,purchased:[],userId:null,outcomeUncertain:false});
(async()=>{
  for (const mode of ['network','bad-json','bad-receipt',503]) {
    let pending=fresh(), client=loadClient(); responseMode=mode;
    await assert.rejects(()=>client.createOrder({...input,checkoutToken:pending.token},pending));
    const original=requests.at(-1);
    for (const status of [400,401,403,409,413,415]) {
      pending=JSON.parse(storage.get('movio-pending-checkout'));client=loadClient();responseMode=status;
      await assert.rejects(()=>client.createOrder({items:[],checkoutToken:'replacement'},pending), e=>!e.definitive);
      assert.deepEqual(requests.at(-1),original,'Use stored payload/token despite changed retry input');
      assert.equal(JSON.parse(storage.get('movio-pending-checkout')).outcomeUncertain,true);
    }
    responseMode='success';pending=JSON.parse(storage.get('movio-pending-checkout'));
    assert.equal((await loadClient().createOrder({},pending)).id,'one-order');
    assert.deepEqual(requests.at(-1),original);
  }
  // A first definitive rejection remains safe to clear; no earlier commit exists.
  for (const status of [400,401,403,409,413,415]) {
    responseMode=status;const pending=fresh();
    await assert.rejects(()=>loadClient().createOrder(input,pending),e=>e.definitive===true);
    assert.equal(pending.outcomeUncertain,false);
  }
  // Pending requests from older releases must be treated conservatively.
  const legacy=fresh();delete legacy.outcomeUncertain;responseMode=403;
  await assert.rejects(()=>loadClient().createOrder(input,legacy),e=>!e.definitive);
  assert.equal(legacy.outcomeUncertain,true);assert(resetCount>0);
  console.log('PASS checkout retry: network/503/malformed responses, subsequent 400/401/403/409/413/415, reload, immutable payload/token, legacy pending requests and first definitive rejection; simulated services only, no SQL');
})().catch(e=>{console.error(e);process.exitCode=1});
