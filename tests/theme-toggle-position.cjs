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
 try{let data=fs.readFileSync(path.join(root,name));if(name.endsWith('.html')){data=data.toString().replace(/<script src="https:[^>]*><\/script>/g,'').replace(/<link\b[^>]*href="https:[^>]*>/g,'');if(url.searchParams.has('align-baseline'))data=data.replace(/(theme.js\?[^"]*)/, '$1&alignment-baseline=1');if(url.searchParams.has('baseline'))data=data.replace(/<script src="theme.js[^>]*><\/script>/,'').replace(/<link[^>]*href="theme.css[^>]*>/,'');}
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
    const controls=()=>evaluate(`(()=>{const selectors=['header','.wordmark','.wordmark img','.header-search','.search-form','#site-search','.header-cart-link','#accountButton','.item-header-back','.detail-header-cart'];return selectors.map(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {selector:s,rect:[r.x,r.y,r.width,r.height]}})})()`);

    for(const width of (process.argv.includes('--desktop')?[1280]:[320,375,768,1280])){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      for(const mode of ['dark','light']){
        await navigate(base+'/index.html');await evaluate(`localStorage.setItem('movio-theme',${JSON.stringify(mode)})`);
        for(const name of pages){
          const item=name==='item.html'?'&item=theme-0':'';
          await navigate(base+'/'+name+'?align-baseline=1'+item);const before=await controls();
          await navigate(base+'/'+name+(item?'?item=theme-0':''));const current=await controls();
          for(const selector of ['.header-search','.search-form','#site-search']){const a=before.find(e=>e?.selector===selector),b=current.find(e=>e?.selector===selector);if(a)assert.deepEqual(b.rect.slice(0,2),a.rect.slice(0,2),`${name} ${width}px search position`);}
          for(const selector of ['.header-cart-link','#accountButton','.item-header-back','.detail-header-cart']){const a=before.find(e=>e?.selector===selector),b=current.find(e=>e?.selector===selector);if(a)assert.deepEqual(b.rect.slice(2),a.rect.slice(2),selector+' size retained');}
          const position=await evaluate(`(()=>{const e=document.querySelector('.theme-toggle'),h=e.closest('header').getBoundingClientRect(),r=e.getBoundingClientRect(),group=document.querySelector('.theme-account-controls'),cart=group.querySelector('.header-cart-link'),login=group.querySelector('#accountButton');const c=cart?.getBoundingClientRect(),l=login?.getBoundingClientRect(),g=group.getBoundingClientRect();return {count:document.querySelectorAll('.theme-toggle').length,rightGap:h.right-r.right,top:r.top,bottom:r.bottom,headerTop:h.top,headerBottom:h.bottom,position:getComputedStyle(e).position,overflow:document.documentElement.scrollWidth>innerWidth,cartLoginGap:c&&l?l.left-c.right:null,sameRow:c&&l?Math.abs((l.top+l.height/2)-(c.top+c.height/2))<.1:true,spacer:r.left-g.right,overlap:r.left<g.right||r.right>h.right}})()`);
          assert.equal(position.count,1);assert.equal(position.position,'static');assert(Math.abs(position.rightGap-(width>1000?77:12))<.1,JSON.stringify({name,width,mode,...position}));assert(position.top>=position.headerTop&&position.bottom<=position.headerBottom);assert(!position.overflow&&!position.overlap,JSON.stringify({name,width,...position}));assert(position.spacer>=7.9&&position.sameRow,JSON.stringify(position));if(position.cartLoginGap!==null)assert(position.cartLoginGap>=8&&position.cartLoginGap<=12,JSON.stringify(position));
          await evaluate(`document.querySelector('.theme-toggle').click()`);assert.equal(await evaluate(`document.documentElement.dataset.theme`),mode==='dark'?'light':'dark');await evaluate(`document.querySelector('.theme-toggle').click()`);assert.deepEqual(await controls(),current,'Theme flip retains layout');
        }
      }
      console.log('PASS '+width+'px both themes: stable flex/grid, search position retained, cart/login gap 10px, flexible spacer, responsive toggle inset, unchanged buttons, no duplicates/overlap/overflow');
    }
    await navigate(base+'/index.html');
    for(const width of [375,1280,768,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});await wait(100);assert(await evaluate(`(()=>{const e=document.querySelector('.theme-toggle');return Math.abs(e.closest('header').getBoundingClientRect().right-e.getBoundingClientRect().right-(innerWidth>1000?77:12))<.1})()`));}
    console.log('PASS live viewport resizing with CSS only; theme preference/icons retained');
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
