const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const pages=['index.html','item.html','cart.html','contact.html','delivery.html','privacy.html','returns.html','terms.html'];
const products=['electric-scooters','electric-bikes','quad-bikes'].map((category,i)=>({id:'theme-'+i,name:'Theme product '+i,category,category_key:category,description:'Technical description',specifications:[{label:'Power',value:'500 W'}],price:500,old_price:700,old_price_visible:true,discount_visible:true,discount_percent:15,stock:3,active:true,free_delivery:true,weight_kg:10,image:'scooter-red.png',images:['scooter-red.png']}));
assert(!/theme\.(?:js|css)/.test(fs.readFileSync(path.join(root,'admin.html'),'utf8')),'Admin does not load customer themes');
for(const name of pages){const s=fs.readFileSync(path.join(root,name),'utf8');assert.equal((s.match(/src="theme\.js/g)||[]).length,1,name);assert.equal((s.match(/href="theme\.css/g)||[]).length,1,name);assert(s.indexOf('src="theme.js')<s.indexOf('href="styles.css'),'Preference restored before styling');}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=url.pathname.slice(1)||'index.html';
 if(name==='supabaseClient.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.movioSupabase={from:()=>({select:()=>{const q={order:async()=>({data:${JSON.stringify(products)}}),eq:()=>q,limit:async()=>({data:${JSON.stringify(products)}})};return q;}}),auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:false})};`);return;}
 if(name==='theme.js'&&url.searchParams.has('alignment-baseline')){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,name),'utf8').replace("    header.classList.add('storefront-theme-header');",''));return;}
 if(name==='theme.css'&&url.searchParams.has('spacing-baseline')){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,name),'utf8').replace('--header-actions-inset: 35px','--header-actions-inset: 0px'));return;}
 try{let data=fs.readFileSync(path.join(root,name));if(name.endsWith('.html')){data=data.toString().replace(/<script src="https:[^>]*><\/script>/g,'').replace(/<link\b[^>]*href="https:[^>]*>/g,'');if(url.searchParams.has('spacing-baseline'))data=data.replace(/(theme.css\?[^"]*)/,'$1&spacing-baseline=1');if(url.searchParams.has('align-baseline'))data=data.replace(/(theme.js\?[^"]*)/, '$1&alignment-baseline=1');if(url.searchParams.has('baseline'))data=data.replace(/<script src="theme.js[^>]*><\/script>/,'').replace(/<link[^>]*href="theme.css[^>]*>/,'');}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);}catch{res.writeHead(404);res.end()}
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-logo-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  ], { windowsHide: true, stdio: 'ignore' });
  let ws;
  try {
    let port;
    for (let index = 0; index < 100; index++) {
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); break; } catch { await wait(100); }
    }
    assert(port, 'Chrome starts');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const call = pending.get(message.id); pending.delete(message.id);
      message.error ? call.reject(message.error) : call.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId; const timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),15000);pending.set(id, { resolve:value=>{clearTimeout(timer);resolve(value)}, reject:error=>{clearTimeout(timer);reject(error)} }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    const loaded = async pathname => {
      for (let index = 0; index < 100; index++) {
        try {
          if (await evaluate(`location.pathname===${JSON.stringify(pathname)}&&document.readyState==='complete'&&(!window.MovioStore||MovioStore.getCatalogStatus()==='ready')`)) return;
        } catch { /* Navigation replaces the execution context. */ }
        await wait(50);
      }
      throw Error(`Timed out loading ${pathname}: ${JSON.stringify(await evaluate(`({url:location.href,state:document.readyState,catalog:window.MovioStore?.getCatalogStatus()})`))}`);
    };
    await send('Page.enable'); await send('Runtime.enable');


    async function navigate(url){await evaluate('window.__leaving=true');await send('Page.navigate',{url});for(let i=0;i<150;i++){await wait(25);try{if(await evaluate(`!window.__leaving&&document.readyState==='complete'&&(!window.MovioStore||MovioStore.getCatalogStatus()==='ready')`))return;}catch{}}throw Error('Navigation timeout');}
    const geometry = () => evaluate(`(()=>{const selectors=['.wordmark','.header-categories','.header-search','.header-cart-link','#accountButton','.theme-toggle'];return selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})})()`);
    for (const width of [320,375,430,760,768,1024,1280,1920]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      await navigate(base+'/index.html');
      for (const mode of ['dark','light']) {
        if(await evaluate('document.documentElement.dataset.theme')!==mode)await evaluate(`document.querySelector('.theme-toggle').click()`);
        assert.equal(await evaluate(`document.querySelectorAll('#headerCategoryMenu a').length`),4);
        assert(await evaluate(`!document.querySelector('.transport-category-row,.transport-category-card,#categories')&&document.querySelector('.hero .primary-action').getAttribute('href')==='#catalog'`),'Tiles removed and homepage product link remains valid');
        const spacing = await evaluate(`(()=>{const c=document.querySelector('#catalog'),first=c.querySelector('.managed-product'),r=c.getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect(),hero=document.querySelector('.hero').getBoundingClientRect();return {gap:r.top-Math.max(h.bottom,hero.bottom),inset:first.getBoundingClientRect().top-r.top}})()`);
        assert(spacing.gap>=-.1&&spacing.inset>=0&&spacing.inset<=40,JSON.stringify({width,mode,spacing}));
        const before=await geometry();
        await evaluate(`document.querySelector('.category-menu-toggle').click()`);
        assert.equal(await evaluate(`document.querySelector('.category-menu-toggle').getAttribute('aria-expanded')`),'true');
        assert.deepEqual(await geometry(),before,'Opening causes no layout shift');
        const layout=await evaluate(`(()=>{const r=document.querySelector('#headerCategoryMenu').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,menu:r.left>=0&&r.right<=innerWidth}})()`);
        assert(!layout.overflow&&layout.menu,JSON.stringify({width,mode,layout}));
        for(let i=0;i<before.length;i++)for(let j=i+1;j<before.length;j++) {
          const a=before[i],b=before[j];assert(a[2]<=b[0]+.1||b[2]<=a[0]+.1||a[3]<=b[1]+.1||b[3]<=a[1]+.1,`Overlap ${width}: ${i},${j}: ${JSON.stringify(before)}`);
        }
        await evaluate(`document.querySelector('.category-menu-toggle').click()`);
        assert(await evaluate(`document.querySelector('#headerCategoryMenu').hidden`),'Toggle closes');
        await evaluate(`document.querySelector('.category-menu-toggle').click();document.querySelector('.hero').click()`);
        assert(await evaluate(`document.querySelector('#headerCategoryMenu').hidden`),'Outside click closes');
        await evaluate(`document.querySelector('.category-menu-toggle').focus();document.querySelector('.category-menu-toggle').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
        assert(await evaluate(`document.activeElement.matches('#headerCategoryMenu a')`));
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
        assert(await evaluate(`document.querySelector('#headerCategoryMenu').hidden&&document.activeElement.matches('.category-menu-toggle')`));
        await evaluate(`document.querySelector('.category-menu-toggle').click()`);
        await evaluate(`document.querySelector('#headerCategoryMenu [data-category-filter="electric-bikes"]').click()`);
        assert(await evaluate(`document.querySelector('#headerCategoryMenu').hidden&&[...document.querySelectorAll('.managed-product')].filter(e=>!e.hidden).length===1&&document.querySelector('.managed-product:not([hidden])').dataset.productCategory==='electric-bikes'`));
        await evaluate(`document.querySelector('#clearCategoryFilter').click()`);
        assert.equal(await evaluate(`[...document.querySelectorAll('.managed-product')].filter(e=>!e.hidden).length`),3);
      }
      console.log('PASS category menu '+width+'px: both themes, open/close, keyboard, filter/reset, no overlap or layout shifts');
    }
    await evaluate(`MovioStore.setCatalog([...MovioStore.getProducts(),{id:'new-category',name:'Helmet',category:'ჩაფხუტები',categoryKey:'helmets',price:50,stock:2,active:true},{id:'inactive',category:'Hidden',categoryKey:'hidden',active:false}])`);
    assert(await evaluate(`!!document.querySelector('#headerCategoryMenu [data-category-filter="helmets"]')&&!document.querySelector('#headerCategoryMenu [data-category-filter="hidden"]')`));
    await evaluate(`document.querySelector('#headerCategoryMenu [data-category-filter="helmets"]').click()`);
    assert(await evaluate(`document.querySelector('#activeCategoryLabel').textContent==='ჩაფხუტები'&&[...document.querySelectorAll('.managed-product')].filter(e=>!e.hidden).length===1`));
    await evaluate(`MovioStore.setCatalog([])`);
    assert.equal(await evaluate(`document.querySelectorAll('#headerCategoryMenu a').length`),1);
    console.log('PASS automatic new category, inactive exclusion, unknown category label/filter and empty catalog');
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
