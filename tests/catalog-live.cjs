// Read-only browser integration check against a running local storefront.
// Run: node tests/catalog-live.cjs [--diagnose]
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'movio-live-catalog-'));
 const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`],{windowsHide:true,stdio:'ignore'});
 let ws;try {
  let port;for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await wait(100)}}
  assert(port,'Chrome started');
  const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(),errors=[],network=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);return;}
   if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
   if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));
   if(m.method==='Network.responseReceived')network.push({url:m.params.response.url,status:m.params.response.status});
   if(m.method==='Network.loadingFailed')errors.push(m.params.errorText);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/'});
  for(let i=0;i<220;i++){await wait(100);if(await evaluate(`document.readyState==='complete' && typeof MovioStore!=='undefined' && MovioStore.getCatalogStatus()!=='loading'`))break;}
  const state=await evaluate(`({charset:document.characterSet,status:MovioStore.getCatalogStatus(),client:typeof window.movioSupabase?.from,products:MovioStore.getProducts().map(p=>({id:p.id,name:p.name,price:p.price,category:p.category,categoryKey:p.categoryKey,active:p.active,stock:p.stock,stockStatus:p.stockStatus})),cards:[...document.querySelectorAll('.managed-product')].map(c=>({text:c.textContent,hidden:c.hidden})),message:document.getElementById('catalogSyncMessage')?.textContent})`);
  console.log(JSON.stringify({state,errors,network:network.filter(r=>/supabase|store|script\.js/.test(r.url))},null,2));
  if(!process.argv.includes('--diagnose')){
   assert.equal(state.status,'ready');assert.equal(state.charset,'UTF-8');assert(state.products.some(p=>p.price===2299&&p.active));assert(state.cards.some(c=>!c.hidden&&c.text.replace(/[^0-9]/g,'').includes('2299')));assert.equal(errors.length,0,'No browser console/network errors');
   assert(network.some(r=>r.url.includes('/rest/v1/products')&&r.status===200),'Browser SELECT succeeded');
   await evaluate(`applyCatalogFilter('electric-scooters')`);assert(await evaluate(`[...document.querySelectorAll('.managed-product')].some(c=>!c.hidden)`));
   console.log('PASS real Supabase/browser: anonymous SELECT, current 2299 GEL scooter, UTF-8, category filter, no console/network errors; no database writes or orders');
  }
 } finally {ws?.close();chrome.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
