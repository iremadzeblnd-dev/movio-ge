const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createServer} = require('../scripts/dev-server.cjs');
const nativeFetch = global.fetch;
const read = file => fs.readFileSync(file, 'utf8');
const stale = {id:'deleted-bike',name:'Deleted bicycle',price:1566,stock:4,active:true};
const scooter = {id:'scooter',name:'Scooter',price:2299,stock:3,active:true,category:'Display label',category_key:'electric-scooters'};
function fixture({brokenStorage=false, missingClient=false}={}) {
  const values = new Map([['movio-data-v1',JSON.stringify({products:[stale],orders:[{id:'receipt'}]})],['movio-cart',JSON.stringify([{id:stale.id,quantity:1},{id:'scooter',quantity:2}])]]);
  let response, reads=0;
  const writes=[];
  const client={from(table){assert.equal(table,'products');return {
    select(){return {order(){reads++;return new Promise(resolve=>{response=resolve;});}}},
    insert(){writes.push('insert');throw Error('Unexpected write')},
    update(){writes.push('update');throw Error('Unexpected write')},
    delete(){writes.push('delete');throw Error('Unexpected write')}
  }}};
  const events=[];
  const context={setTimeout,clearTimeout,Event,console:{error(){}},window:{movioSupabase:missingClient?null:client,dispatchEvent:e=>events.push(e.type),location:{reload(){throw Error('Unexpected reload')}}},document:{getElementById:()=>null},localStorage:{getItem:k=>{if(brokenStorage)throw Error('Storage disabled');return values.get(k)||null},setItem:(k,v)=>{if(brokenStorage)throw Error('Storage disabled');values.set(k,v)}}};
  vm.createContext(context);
  vm.runInContext(read('store.js'),context);
  vm.runInContext(read('supabase-sync.js'),context);
  return {context,values,writes,events,store:context.window.MovioStore,respond:value=>response(value),reads:()=>reads};
}
(async()=>{
  const f=fixture(), cart=f.values.get('movio-cart');
  assert.equal(f.store.getCatalogStatus(),'loading');
  assert.equal(f.store.getProducts().length,0);
  assert.equal(f.store.addToCart(stale.id),false);
  const same=f.store.syncFromSupabase();assert.equal(f.reads(),1,'Concurrent sync coalesces reads');
  f.respond({data:[scooter]});await same;
  assert.equal(f.store.getProducts()[0].price,2299);
  assert.equal(f.store.getProducts()[0].categoryKey,'electric-scooters');
  assert.equal(f.values.get('movio-cart'),cart,'Sync preserves cart');
  assert.equal(JSON.parse(f.values.get('movio-data-v1')).orders[0].id,'receipt');
  assert.equal(f.store.addToCart(stale.id),false);
  f.values.set('movio-data-v1',JSON.stringify({products:[stale],orders:[]}));
  assert.equal(f.store.getProducts()[0].id,'scooter','Stale cross-tab cache cannot replace session catalog');
  let sync=f.store.syncFromSupabase();f.respond({data:[]});await sync;
  assert.equal(f.store.getProducts().length,0,'Empty remote catalog clears deleted products');
  assert.equal(JSON.parse(f.values.get('movio-data-v1')).products.length,0);
  sync=f.store.syncFromSupabase();f.respond({error:Error('Offline')});await sync;
  assert.equal(f.store.getCatalogStatus(),'error');assert.equal(f.store.getProducts().length,0);assert.equal(f.values.get('movio-cart'),cart);
  sync=f.store.syncFromSupabase();f.respond({data:null});await sync;assert.equal(f.store.getCatalogStatus(),'error');
  assert.deepEqual(f.writes,[],'Synchronization never mutates remote products');
  const noStorage=fixture({brokenStorage:true});noStorage.respond({data:[scooter]});await noStorage.store.catalogReady;
  assert.equal(noStorage.store.getProducts()[0].price,2299,'Catalog works without browser storage');
  const missing=fixture({missingClient:true});await missing.store.catalogReady;assert.equal(missing.store.getCatalogStatus(),'error');
  // Execute the real category and cart reconciliation functions in isolation.
  const source=read('script.js');
  vm.runInContext(source.slice(source.indexOf('function getProductCategoryKey'),source.indexOf('function applyCatalogFilter')),f.context);
  for(const [input,expected] of [[{category:'Wrong label',categoryKey:'electric-scooters'},'electric-scooters'],[{category:'electric-bikes'},'electric-bikes'],[{category:'quad-bikes'},'quad-bikes'],[{category:'ელექტრო სკუტერები'},'electric-scooters']])assert.equal(f.context.getProductCategoryKey(input),expected);
  vm.runInContext(source.slice(source.indexOf('class CartStore'),source.indexOf('const cartStore ='))+'\nwindow.TestCartStore=CartStore;',f.context);
  sync=f.store.syncFromSupabase();f.respond({data:[scooter]});await sync;
  const cartStore=new f.context.window.TestCartStore();assert.equal(cartStore.items.length,1);assert.equal(cartStore.items[0].id,'scooter');assert.equal(cartStore.items[0].quantity,2);
  assert.equal(f.values.get('movio-cart'),cart,'Unavailable IDs excluded without erasing saved cart');
  f.store.setCatalog([{...f.store.getProducts()[0],stock:500}]);
  f.values.set('movio-cart',JSON.stringify([{id:'scooter',quantity:100}]));
  assert(f.store.addToCart('scooter'));assert.equal(JSON.parse(f.values.get('movio-cart'))[0].quantity,100,'Store enforces server quantity limit');
  f.context.getProduct=id=>f.store.getProducts().find(p=>String(p.id)===String(id));
  cartStore.items=cartStore.load();cartStore.setQuantity('scooter',500);assert.equal(cartStore.items[0].quantity,100,'Cart controls enforce server quantity limit');
  const {server,products}=createServer({offline:true});
  try {
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
    const js=await (await nativeFetch(base+'/supabase-sync.js?v=regression')).text();assert(js.includes('fetchCatalog'),'Mock serves real synchronization');
    const client=await (await nativeFetch(base+'/supabaseClient.js')).text();assert(!client.includes('localStorage'),'Mock never seeds stale browser storage');
    const rows=await (await nativeFetch(base+'/__offline/products')).json();assert.equal(rows.length,2);assert.equal(rows[0].free_delivery,false);
    delete products['local-paid'];const next=await (await nativeFetch(base+'/__offline/products')).json();assert.equal(next.length,1,'Mock catalog reflects deletion immediately');
    assert((await (await nativeFetch(base+'/')).text()).includes('OFFLINE MOCK PREVIEW'));
  } finally {await new Promise(r=>server.close(r));}
  const live=createServer();
  try {
    await new Promise(r=>live.server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${live.server.address().port}`;
    const pageResponse=await nativeFetch(base+'/');assert.match(pageResponse.headers.get('content-type'),/charset=utf-8/i);
    assert((await (await nativeFetch(base+'/supabaseClient.js')).text()).includes('iocjpgiarjqpnvqjbhtt.supabase.co'),'Default preview serves real Supabase client');
    assert(!(await (await nativeFetch(base+'/')).text()).includes('OFFLINE MOCK PREVIEW'));
    assert.equal((await nativeFetch(base+'/api/orders',{method:'POST'})).status,503,'Live preview cannot place orders');
  } finally {await new Promise(r=>live.server.close(r));}
  for(const file of ['script.js','product-detail.js']) {const text=read(file);assert(!/\?{3,}/.test(text),`${file}: no corrupted question-mark strings`);assert(text.includes('\u10de\u10e0\u10dd\u10d3\u10e3\u10e5\u10e2\u10d4\u10d1\u10d8'),'Georgian loading text preserved');}
  console.log('PASS catalog synchronization: deleted/stale/empty catalog, fail closed, missing client, storage disabled, cart preservation and reconciliation, category keys, no remote writes/reloads, current offline mock catalog');
})().catch(error=>{console.error(error);process.exitCode=1});
