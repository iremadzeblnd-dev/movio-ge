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
  const state=await evaluate(`({charset:document.characterSet,status:MovioStore.getCatalogStatus(),client:typeof window.movioSupabase?.from,products:MovioStore.getProducts().map(p=>({id:p.id,name:p.name,price:p.price,oldPrice:p.oldPrice,oldPriceVisible:p.oldPriceVisible,category:p.category,categoryKey:p.categoryKey,active:p.active,stock:p.stock,stockStatus:p.stockStatus})),cards:[...document.querySelectorAll('.managed-product')].map(c=>({text:c.textContent,hidden:c.hidden})),message:document.getElementById('catalogSyncMessage')?.textContent})`);
  console.log(JSON.stringify({state,errors,network:network.filter(r=>/supabase|store|script\.js/.test(r.url))},null,2));
  if(!process.argv.includes('--diagnose')){
   assert.equal(state.status,'ready');assert.equal(state.charset,'UTF-8');assert(state.products.some(p=>p.active),'Real active products required');assert.equal(errors.length,0,'No browser console/network errors');
   assert(network.some(r=>r.url.includes('/rest/v1/products')&&r.status===200),'Browser SELECT succeeded');
   const rawCategories=await evaluate(`(async()=>{const result=await window.movioSupabase.from('products').select('id,category,category_key');if(result.error)throw Error(result.error.message);return result.data;})()`);
   console.log('RAW SAVED CATEGORIES '+JSON.stringify(rawCategories));
   const localCategory=process.argv.find(argument=>argument.startsWith('--local-category='))?.split('=')[1];
   if(localCategory){
    await evaluate(`(()=>{
      const key=${JSON.stringify(localCategory)};
      if(!MovioStore.getCategories().some(category=>category.key===key))throw Error('Invalid local category');
      const products=MovioStore.getProducts().map(product=>product.active!==false&&!MovioStore.getCategories().some(category=>category.key===MovioStore.getCategoryKey(product))?{...product,category:key,categoryKey:key}:product);
      MovioStore.setCatalog(products);
    })()`);
    console.log('LOCAL BROWSER CATEGORY CORRECTION ONLY: '+localCategory+'; Supabase unchanged');
   }
   for(const width of [375,1280]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    const report=await evaluate(`(()=>{
      const products=MovioStore.getProducts().filter(p=>p.active!==false);
      const verify=(condition,message)=>{if(!condition)throw Error(message)};
      const cards=()=>[...document.querySelectorAll('.managed-product')];
      verify(cards().length===products.length,'Every active real product renders');
      for(const product of products){
        const category=MovioStore.getCategoryKey(product);
        applyCatalogFilter(category);
        const card=cards().find(c=>c.dataset.productId===String(product.id));
        verify(card&&!card.hidden,'Real product remains visible in assigned category');
        verify(cards().filter(c=>!c.hidden).length===products.filter(p=>MovioStore.getCategoryKey(p)===category).length,'Exact category membership');
        verify(card.querySelector('.product-price-label').textContent===formatPrice(product.price),'Actual current price renders');
        const old=card.querySelector('.product-old-price-label');
        verify(Boolean(old)===MovioStore.shouldShowOldPrice(product),'Actual toggle controls old price');
        if(old){
          verify(old.textContent===formatPrice(product.oldPrice),'Actual old price renders');
          verify(getComputedStyle(old).textDecorationLine.includes('line-through'),'Actual old price is crossed out');
          const currentRect=card.querySelector('.product-price-label').getBoundingClientRect(),oldRect=old.getBoundingClientRect();
          verify(oldRect.left>=currentRect.right&&Math.abs(oldRect.bottom-currentRect.bottom)<12,'Actual prices appear beside each other');
        }
      }
      const withOldPrice=products.filter(p=>Number.isFinite(Number(p.oldPrice))&&Number(p.oldPrice)>0);
      verify(withOldPrice.length>0,'Real old price required to verify enabled state');
      // Toggle only the browser catalog; never call saveProduct or mutate Supabase.
      for(const enabled of [false,true]){
        MovioStore.setCatalog(products.map(p=>({...p,oldPriceVisible:enabled})));
        applyCatalogFilter('');
        for(const product of withOldPrice){
          const card=cards().find(c=>c.dataset.productId===String(product.id)),old=card.querySelector('s');
          verify(Boolean(old)===enabled,'Real product data respects both toggle states');
          if(old)verify(getComputedStyle(old).textDecorationLine.includes('line-through'),'Enabled old price is crossed out');
        }
      }
      MovioStore.setCatalog(products);applyCatalogFilter('');
      return {products:products.length,realOldPrices:withOldPrice.length,categories:[...new Set(products.map(p=>MovioStore.getCategoryKey(p)))]};
    })()`);
    console.log('PASS real catalog at width '+width+': '+JSON.stringify(report));
   }
   assert.equal(errors.length,0,'No browser errors during real-data verification');
   console.log('PASS real Supabase/browser: actual prices and saved toggle, local toggle on/off, exact stored category membership, mobile/desktop; no database writes or orders');
   const categoryAudit=await evaluate(`(()=>{
     const filters=[...document.querySelectorAll('[data-category-filter]')].map(link=>link.dataset.categoryFilter);
     return MovioStore.getProducts().filter(product=>product.active!==false).map(product=>{
       const key=MovioStore.getCategoryKey(product);
       return {id:product.id,category:product.category,categoryKey:key,customerSelectable:filters.includes(key)};
     });
   })()`);
   console.log('REAL CATEGORY ASSIGNMENT AUDIT '+JSON.stringify(categoryAudit));
   assert(categoryAudit.every(product=>product.customerSelectable),'Real product category is absent from customer category navigation; correct its saved assignment before claiming end-to-end category success');
  }
 } finally {ws?.close();chrome.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
