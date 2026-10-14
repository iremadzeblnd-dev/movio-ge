// Isolated browser models: no network, SQL, or live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const initial = {id:'p',name:'Product',category:'electric-scooters',price:100,stock:3,active:true,updated_at:'revision-1',image:'image-A',images:['image-A','image-B']};
const session = new Map();
function page(row = initial, {fail = false, blockedStorage = false} = {}) {
  const calls = [];
  const rows = row ? [row] : [];
  const values = new Map();
  const ctx = {setTimeout,clearTimeout,AbortController,Event,console:{error(){}},
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    sessionStorage:{getItem:key=>{if(blockedStorage)throw Error('blocked');return session.get(key)||null;},setItem:(key,value)=>{if(blockedStorage)throw Error('quota');session.set(key,value);}},
    document:{querySelector:selector=>selector==='[data-managed-products]'?{}:null},
    window:{dispatchEvent(){},movioSupabase:{from(){return {select(columns){
      let selected=rows;
      const project=row=>columns==='*'?row:Object.fromEntries(columns.split(',').filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
      const q={abortSignal:()=>q,eq:(key,value)=>{selected=selected.filter(r=>r[key]===value);return q;},
        order:async()=>{calls.push({type:'metadata',columns});return fail?{error:Error('unavailable')}:{data:selected.map(project)};},
        limit:async()=>{calls.push({type:'image',columns});return {data:selected.map(project)};}};
      return q;
    }}}}}};
  vm.createContext(ctx);
  for(const file of ['store.js','supabase-sync.js']) vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return {store:ctx.window.MovioStore,calls};
}
(async()=>{
  let p=page(); await p.store.catalogReady;
  assert(!p.calls[0].columns.split(',').some(key=>['image','images'].includes(key)),'Homepage critical response excludes every image payload');
  assert.equal(p.store.getProducts()[0].price,100);
  assert.equal(p.store.getProducts()[0].image,'');
  await Promise.all([p.store.loadProductImageData('p'),p.store.loadProductImageData('p')]);
  assert.equal(p.calls.filter(c=>c.type==='image').length,1,'Concurrent image reads coalesce');
  p=page({...initial,price:125,stock:2}); await p.store.catalogReady;
  assert.equal(p.store.getProducts()[0].image,'image-A','Verified matching revision reuses cached main image');
  assert.equal(p.store.getProducts()[0].price,125,'Prices always come from fresh metadata');
  assert.equal(p.store.getProducts()[0].stock,2,'Stock always comes from fresh metadata');
  await p.store.loadProductImageData('p'); assert.equal(p.calls.length,1,'Cache hit performs no image request');
  const inactive=page({...initial,active:false}); await inactive.store.catalogReady;
  await assert.rejects(inactive.store.loadProductImageData('p'),'Deactivated products cannot reuse an old photo through the loader');
  p=page({...initial,updated_at:'revision-2',image:'image-new'}); await p.store.catalogReady;
  assert.equal(p.store.getProducts()[0].image,'','Changed revision invalidates old photo');
  assert.equal((await p.store.loadProductImageData('p')).image,'image-new');
  p=page(null); await p.store.catalogReady; assert.equal(p.store.getProducts().length,0,'Cache never resurrects deleted products');
  p=page(initial,{fail:true}); await p.store.catalogReady;
  assert.equal(p.store.getCatalogStatus(),'error'); assert.equal(p.store.getProducts().length,0,'No stale price/stock fallback after failed validation');
  p=page({...initial,updated_at:null}); await p.store.catalogReady;
  assert.equal(p.store.getProducts()[0].image,'','Missing revision cannot validate cached photos');
  p=page(initial,{blockedStorage:true}); await p.store.catalogReady;
  assert.equal((await p.store.loadProductImageData('p')).image,'image-A','Image retrieval works when storage is blocked');
  console.log('PASS progressive catalog: metadata first, request coalescing, revision-validated photo reuse, fresh price/stock, changed images, deletion/error safety, legacy revisions and blocked storage; no network');
})().catch(error=>{console.error(error);process.exitCode=1});
