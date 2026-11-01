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
 try{let data=fs.readFileSync(path.join(root,name));if(name.endsWith('.html')){data=data.toString().replace(/<script src="https:[^>]*><\/script>/g,'').replace(/<link\b[^>]*href="https:[^>]*>/g,'');if(url.searchParams.has('baseline'))data=data.replace(/<script src="theme.js[^>]*><\/script>/,'').replace(/<link[^>]*href="theme.css[^>]*>/,'');}
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
      const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
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


    async function freshReload(pathname){
      await evaluate('window.__themeLeaving=true');await send('Page.reload');
      for(let i=0;i<150;i++){await wait(25);try{if(await evaluate(`!window.__themeLeaving&&document.readyState==='complete'`)){await loaded(pathname);return}}catch{}}
      throw Error('Reload did not finish: '+pathname);
    }
    const snapshot = async () => evaluate(`(()=>{
      const props=['display','position','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','width','height','minWidth','maxWidth','minHeight','maxHeight','marginTop','marginRight','marginBottom','marginLeft','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','justifyContent','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','transform'];
      const elements=[...document.querySelectorAll('body, header, header *, main, main *, footer, footer *, .account-dialog, .account-dialog *')].filter(e=>e.getClientRects().length&&!e.closest('.theme-toggle svg'));
      return {height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,elements:elements.map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {tag:e.tagName,id:e.id,cls:typeof e.className==='string'?e.className:'svg',rect:[r.x+scrollX,r.y+scrollY,r.width,r.height].map(v=>Math.round(v*100)/100),style:props.map(p=>c[p])}})};
    })()`);
    async function sameGeometry(baseline,label){const after=await snapshot();assert.equal(after.height,baseline.height,label+' document height');assert.equal(after.width,baseline.width,label+' document width');assert.equal(after.elements.length,baseline.elements.length,label+' DOM count');for(let i=0;i<after.elements.length;i++)assert.deepEqual(after.elements[i],baseline.elements[i],label+' element '+i+' '+baseline.elements[i].tag+'.'+baseline.elements[i].cls);}
    async function flip(){await evaluate(`document.querySelector('.theme-toggle').click()`);await wait(100);}
    for(const width of [320,375,430,768,1280]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      for(const name of pages){
        await send('Page.navigate',{url:base+'/'+name+(name==='item.html'?'?item=theme-0':'')});await loaded('/'+name);
        await evaluate(`localStorage.setItem('movio-theme','dark')`);await freshReload('/'+name);await wait(100);
        await evaluate(`window.scrollTo(0,0)`);const dark=await snapshot();
        // Reproduce the old source swap: it drops the filename-based sizing rules.
        if(name==='index.html'&&width===1280){
          await evaluate(`(()=>{const e=document.querySelector('.wordmark img');window.logoSizing=e.getAttribute('class');e.classList.remove('movio-brand-image');e.src='movio-logo-light.svg'})()`);await wait(50);
          const oldWidth=await evaluate(`document.querySelector('.wordmark img').getBoundingClientRect().width`);
          await evaluate(`(()=>{const e=document.querySelector('.wordmark img');e.className=window.logoSizing;e.src='movio-logo-final.svg'})()`);await wait(50);
          assert(oldWidth>dark.elements.find(e=>e.tag==='IMG'&&e.cls.includes('movio-brand-image')).rect[2],'Missing stable sizing reproduces oversized light logo');
          console.log('CONFIRMED root cause: removing source-independent logo class reproduces width '+oldWidth+'px at 1280px');
        }
        for(let i=0;i<4;i++){await evaluate(`document.querySelector('.theme-toggle').click()`);await sameGeometry(dark,name+' '+width+'px immediate flip '+i);await wait(100);await sameGeometry(dark,name+' '+width+'px settled flip '+i);}
        await flip();await sameGeometry(dark,name+' '+width+'px light');await freshReload('/'+name);await wait(100);await sameGeometry(dark,name+' '+width+'px light refresh');
        assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');assert(!(await evaluate(`document.documentElement.scrollWidth>innerWidth`)),name+' overflow');
      }
      await send('Page.navigate',{url:base+'/index.html'});await loaded('/index.html');await evaluate(`document.querySelector('#site-search').value='Theme';document.querySelector('#site-search').dispatchEvent(new Event('input',{bubbles:true}))`);const search=await snapshot();await flip();await sameGeometry(search,width+'px open search');await flip();await sameGeometry(search,width+'px open search return');
      for(const mode of ['login','register']){
        await send('Page.navigate',{url:base+'/index.html'});await loaded('/index.html');await evaluate(`document.querySelector('.theme-toggle').click();document.querySelector('#accountButton').click()`);await wait(50);if(mode==='register')await evaluate(`document.querySelector('[data-auth-mode="register"]').click()`);await wait(50);const modal=await snapshot();await flip();await sameGeometry(modal,width+'px '+mode+' modal');await flip();await sameGeometry(modal,width+'px '+mode+' modal return');
      }
      console.log('PASS layout invariance '+width+'px: all 8 pages, headers/footer/cards/details, 4 repeated flips, light refresh and customer modals; no overflow');
    }
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
