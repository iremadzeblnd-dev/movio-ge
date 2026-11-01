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
    const controls=()=>evaluate(`(()=>{const selectors=['header','.wordmark','.wordmark img','.header-search','.search-form','#site-search','.header-cart-link','#accountButton','.item-header-back','.detail-header-cart'];return selectors.map(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {selector:s,rect:[r.x,r.y,r.width,r.height]}})})()`);


    const snapshot=()=>evaluate(`(()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};return {logo:box('.wordmark img'),search:box('.header-search'),cart:box('.header-cart-link'),login:box('#accountButton'),toggle:box('.theme-toggle'),header:box('header')}})()`);
    for(const width of [375,768,1280]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      for(const mode of ['dark','light']){
        await navigate(base+'/index.html');await evaluate(`localStorage.setItem('movio-theme',${JSON.stringify(mode)})`);
        for(const name of pages){
          await navigate(base+'/'+name+'?spacing-baseline=1'+(name==='item.html'?'&item=theme-0':''));const before=await snapshot();
          await navigate(base+'/'+name+(name==='item.html'?'?item=theme-0':''));const after=await snapshot();
          if(width<1001)assert.deepEqual(after,before,`${name} ${width}px mobile/tablet unchanged`);
          else {
            assert.deepEqual(after.logo,before.logo,`${name} logo unchanged`);
            for(const key of ['cart','login','toggle'])if(before[key]){assert(Math.abs(after[key][0]-before[key][0]-(key==='toggle'?-35:35))<.1,`${name} ${key} moves exactly 35px in the requested direction`);assert.deepEqual(after[key].slice(1),before[key].slice(1),`${name} ${key} size and y unchanged`);}
            if(before.search)assert.deepEqual(after.search,before.search,'Search dimensions and position unchanged');
          }
          const state=await evaluate(`(()=>{const r=s=>document.querySelector(s)?.getBoundingClientRect(),a=r('.header-cart-link'),b=r('#accountButton'),t=r('.theme-toggle'),s=r('.header-search');return {overflow:document.documentElement.scrollWidth>innerWidth,gap:a&&b?b.left-a.right:10,searchClear:!s||!a||s.right<=a.left||s.top>=a.bottom||s.bottom<=a.top,toggleClear:!b||t.left>=b.right,count:document.querySelectorAll('.theme-toggle').length}})()`);
          assert(!state.overflow&&state.searchClear&&state.toggleClear,JSON.stringify({width,name,mode,...state}));assert(Math.abs(state.gap-10)<.1);assert.equal(state.count,1);
          await evaluate(`document.querySelector('.theme-toggle').click()`);assert.deepEqual(await snapshot(),after,'Theme switch retains spacing');await evaluate(`document.querySelector('.theme-toggle').click()`);
        }
      }
      console.log('PASS '+width+'px both themes: '+(width<1001?'mobile/tablet unchanged':'Cart/Login +35px, toggle -35px; Search unchanged')+'; original logo/buttons, 10px gap, no overlap/overflow');
    }
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
