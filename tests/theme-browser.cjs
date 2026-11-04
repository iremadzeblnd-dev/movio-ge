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
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':/\.jpe?g$/i.test(name)?'image/jpeg':'image/svg+xml');res.end(data);}catch{res.writeHead(404);res.end()}
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

    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    for(const width of [320,375,430,1280,1920]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      await send('Page.navigate',{url:base+'/index.html?baseline=1'});await loaded('/index.html');
      const darkBaseline=await evaluate(`['body','.hero','.compact-product-card','.search-form'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [c.backgroundColor,c.color,c.borderColor]})`);
      await evaluate(`localStorage.removeItem('movio-theme');localStorage.removeItem('movio-cart')`);await send('Page.navigate',{url:base+'/index.html'});await loaded('/index.html');
      assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark','First visit ignores system light preference');
      const dark=await evaluate(`['body','.hero','.compact-product-card','.search-form'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [c.backgroundColor,c.color,c.borderColor]})`);assert.deepEqual(dark,darkBaseline,'Existing dark palette unchanged');
      assert.equal(await evaluate(`document.querySelectorAll('.theme-toggle').length`),1);
      const hero=await evaluate(`(()=>{const hero=document.querySelector('.hero-cinematic'),image=hero.querySelector('img'),text=hero.querySelector('h1'),r=image.getBoundingClientRect(),h=hero.getBoundingClientRect(),t=text.getBoundingClientRect();return {ready:image.complete&&image.naturalWidth===1671&&image.naturalHeight===941,originalRatio:Math.abs(r.width/r.height-1671/941)<.001,fullWidth:Math.abs(r.width-document.documentElement.clientWidth)<1&&Math.abs(h.left)<1,fillsFrame:Math.abs(r.height-h.height)<1&&Math.abs(r.left-h.left)<1&&Math.abs(r.right-h.right)<1,minimal:hero.querySelectorAll('a,button,p,svg').length===0,headline:text.textContent,clearArea:t.right<=r.left+r.width*.32&&t.bottom<=r.top+r.height*.27,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
      assert(hero.ready&&hero.originalRatio&&hero.fullWidth&&hero.fillsFrame&&hero.minimal&&hero.clearArea&&!hero.overflow,JSON.stringify({width,...hero}));
      assert.equal(hero.headline,'თავისუფლება იწყება აქ.');
      await evaluate(`document.querySelector('#site-search').value='Theme';document.querySelector('#loginEmail').value='kept@example.test';document.querySelector('#registerName').value='Kept';MovioStore.addToCart('theme-0');window.preservedThemeNode=document.querySelector('.compact-product-card');document.querySelector('.theme-toggle').click()`);
      assert(await evaluate(`document.documentElement.dataset.theme==='light'&&localStorage.getItem('movio-theme')==='light'&&document.querySelector('#site-search').value==='Theme'&&document.querySelector('#loginEmail').value==='kept@example.test'&&document.querySelector('#registerName').value==='Kept'&&window.preservedThemeNode===document.querySelector('.compact-product-card')`),'Instant switch preserves inputs and DOM');
      for(const name of pages){await send('Page.navigate',{url:base+'/'+name+(name==='item.html'?'?item=theme-0':'')});await loaded('/'+name);
        assert(await evaluate(`document.documentElement.dataset.theme==='light'&&document.querySelectorAll('.theme-toggle').length===1`),name+' restores light');
        const layout=await evaluate(`(()=>{const b=document.querySelector('.theme-toggle'),r=b.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,x:r.x,right:r.right,w:r.width,h:r.height,bg:getComputedStyle(document.body).backgroundColor}})()`);assert(!layout.overflow,JSON.stringify({name,width,...layout}));assert(layout.x>=0&&layout.right<=width&&layout.w>=40&&layout.h>=44,JSON.stringify({name,width,...layout}));assert.equal(layout.bg,'rgb(246, 245, 242)',name+' GISA light background');
        assert(await evaluate(`document.title.startsWith('GISA')&&document.querySelector('.wordmark img').getAttribute('src')==='gisa-wordmark.svg'&&document.querySelector('.wordmark img').naturalWidth===963&&getComputedStyle(document.querySelector('.wordmark')).backgroundColor==='rgba(0, 0, 0, 0)'`),name+' uses transparent GISA wordmark without photo/background panel');
        await evaluate(`document.querySelector('.theme-toggle').click()`);assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');await evaluate(`document.querySelector('.theme-toggle').click()`);
      }
      await send('Page.navigate',{url:base+'/cart.html'});await loaded('/cart.html');
      await evaluate(`document.querySelector('#customerName').value='Kept name';document.querySelector('#customerPhone').value='555123456';document.querySelector('.theme-toggle').click();document.querySelector('.theme-toggle').click()`);
      assert(await evaluate(`document.querySelector('#customerName').value==='Kept name'&&document.querySelector('#customerPhone').value==='555123456'&&JSON.parse(localStorage.getItem('movio-cart'))[0].id==='theme-0'`),'Checkout and cart preserved');
      await evaluate(`document.querySelector('[data-cart-action="increase"]').click()`);
      assert(await evaluate(`JSON.parse(localStorage.getItem('movio-cart'))[0].quantity===2&&document.querySelector('#mobileCartTotal').textContent===document.querySelector('[data-cart-total]').textContent`),'Cart totals work in light');
      await evaluate(`document.querySelector('.theme-toggle').click();document.querySelector('[data-cart-action="increase"]').click()`);assert(await evaluate(`JSON.parse(localStorage.getItem('movio-cart'))[0].quantity===3&&document.querySelector('[data-cart-action="increase"]').disabled`),'Stock works in dark');
      await evaluate(`document.querySelector('.theme-toggle').click()`);
      await send('Page.navigate',{url:base+'/index.html'});await loaded('/index.html');
      await evaluate(`document.querySelector('#site-search').value='Theme';document.querySelector('#site-search').dispatchEvent(new Event('input',{bubbles:true}))`);
      assert(await evaluate(`!document.querySelector('.search-results').hidden`),'Light search works');
      await evaluate(`document.querySelector('#accountButton').click()`);await wait(50);
      assert(await evaluate(`document.querySelector('#accountDialog').open&&getComputedStyle(document.querySelector('#accountDialog')).backgroundColor==='rgb(255, 255, 255)'`),'Light customer modal');
      await evaluate(`document.querySelector('.account-close').click()`);await wait(25);
      // Contrast on visible representative text, prices and action buttons.
      const ratios=await evaluate(`(()=>{const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number);const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return ['.hero-cinematic h1','.product-price-label','.hero-headline-accent','.search-submit','.category-menu-toggle','.product-buy .add-label','.product-old-price-label'].map(s=>{const e=document.querySelector(s),c=getComputedStyle(e);let p=e,bg;while(p){const b=rgb(getComputedStyle(p).backgroundColor);if(b.length===3||b[3]===1){bg=b;break}p=p.parentElement}const a=lum(rgb(c.color)),b=lum(bg||[255,255,255]);return {selector:s,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color:c.color,bg}})})()`);
      for(const value of ratios)assert(value.ratio>=4.5,JSON.stringify({width,...value}));
      for(const category of ['electric-scooters','electric-bikes','quad-bikes','car-accessories']){await send('Page.navigate',{url:base+'/'+category+'.html'});await loaded('/index.html');assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');}
      console.log('PASS '+width+'px: dark baseline unchanged; one header toggle; all 8 pages and 4 categories; light restoration; forms/cart preserved; search/customer modal; quantity/stock; representative text contrast; no overflow');
    }
    // Screenshot artifacts for local visual review, never published.
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    for(const width of [375,1280]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});await send('Page.navigate',{url:base+'/index.html'});await loaded('/index.html');await evaluate(`window.scrollTo(0,0)`);for(const theme of ['light','dark']){if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('.theme-toggle').click()`);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'test-results',`gisa-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}}
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});
    for(const page of ['item.html?item=theme-0','cart.html','index.html']){
      await send('Page.navigate',{url:base+'/'+page});await loaded('/'+page.split('?')[0]);
      if(page==='cart.html'){await evaluate(`document.querySelector('[data-cart-action="decrease"]').click();document.querySelector('#mobileCartCheckout').click()`);}
      if(page==='index.html'){await evaluate(`document.querySelector('#accountButton').click();document.querySelector('[data-auth-mode="register"]').click()`);}
      const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'test-results','theme-light-'+page.split('.')[0]+'.png'),Buffer.from(shot.data,'base64'));
    }
    await send('Page.navigate',{url:base+'/admin.html'});await loaded('/admin.html');assert(await evaluate(`!document.querySelector('.theme-toggle')&&!document.documentElement.hasAttribute('data-theme')`),'Admin excluded');
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
