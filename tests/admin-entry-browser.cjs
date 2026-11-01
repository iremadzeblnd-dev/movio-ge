const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const footerPages=['index.html','cart.html','contact.html','delivery.html','privacy.html','returns.html','terms.html'];
for(const name of footerPages){const s=fs.readFileSync(path.join(root,name),'utf8');assert(!s.includes('footer-admin-link'),name);assert.equal((s.match(/class="footer-admin-entry"/g)||[]).length,1,name);assert(s.includes('admin-entry.js'));}
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(name==='supabaseClient.js'){
 res.setHeader('Content-Type','text/javascript');res.end(`
 let authListener;
 window.movioSupabase={
 auth:{getSession:async()=>({data:{session:sessionStorage.getItem('fixture-session')?{user:{id:'fixture'}}:null}}),onAuthStateChange:f=>{authListener=f;return {data:{subscription:{unsubscribe(){}}}}},
 signInWithPassword:async()=>{await new Promise(r=>setTimeout(r,100));if(sessionStorage.getItem('fixture-mode')==='invalid')return {error:{code:'invalid_credentials'}};sessionStorage.setItem('fixture-session','present');authListener?.('SIGNED_IN',{user:{id:'fixture'}});return {data:{session:{user:{id:'fixture'}}}}},signOut:async()=>{sessionStorage.removeItem('fixture-session');authListener?.('SIGNED_OUT',null)}},
 rpc:async name=>{if(name!=='movio_is_admin')return {data:[]};await new Promise(r=>setTimeout(r,100));return sessionStorage.getItem('fixture-mode')==='rpc-error'?{error:{message:'offline'}}:{data:sessionStorage.getItem('fixture-mode')==='admin'}},
 from:()=>({select:()=>({order:async()=>({data:[]})})})};`);return;}
 try{let data=fs.readFileSync(path.join(root,name));if(name.endsWith('.html'))data=data.toString().replace(/<script src="https:[^>]*><\/script>/g,'').replace(/<link\b[^>]*href="https:[^>]*>/g,'');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'image/svg+xml');res.end(data)}catch{res.writeHead(404);res.end()}
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

    for(const width of [375,1280]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:width===375});
      for(const pageName of footerPages){await send('Page.navigate',{url:base+'/'+pageName});await loaded('/'+pageName);assert(await evaluate(`!!document.querySelector('#storefrontAdminDialog')`),pageName+' modal initialized');}
      await send('Page.navigate',{url:base+'/index.html'});await loaded('/index.html');
      await evaluate(`localStorage.setItem('movio-cart','[{"id":"kept","quantity":2}]');window.scrollTo(0,document.documentElement.scrollHeight)`);
      const layout=await evaluate(`(()=>{const b=document.querySelector('.footer-admin-entry'),r=b.getBoundingClientRect();return {text:b.textContent.trim(),label:b.getAttribute('aria-label'),marker:getComputedStyle(b,'::before').content,w:r.width,h:r.height,left:getComputedStyle(b).left,bottom:getComputedStyle(b).bottom,footer:!!b.closest('footer'),overflow:document.documentElement.scrollWidth>innerWidth,overlaps:[...document.querySelector('footer').querySelectorAll('a, .footer-bottom-left > span, .footer-bottom-left > p')].some(e=>{const q=e.getBoundingClientRect();return q.width&&q.height&&r.left<q.right&&r.right>q.left&&r.top<q.bottom&&r.bottom>q.top})}})()`);
      assert.equal(layout.text,'');assert(layout.label);assert.equal(layout.marker,'none');assert.equal(layout.w,44);assert.equal(layout.h,44);assert.equal(layout.left,'4px');assert.equal(layout.bottom,'4px');assert(layout.footer);assert(!layout.overflow);assert(!layout.overlaps,'Dot target does not overlap footer links or copyright');
      await evaluate(`document.querySelector('.footer-admin-entry').click()`);
      assert(await evaluate(`document.querySelector('dialog#storefrontAdminDialog').open&&document.activeElement.id==='storefrontAdminEmail'`));
      const bounds=await evaluate(`(()=>{const r=document.querySelector('#storefrontAdminDialog').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()`);assert(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=812);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(75);assert(await evaluate(`!document.querySelector('#storefrontAdminDialog').open&&document.activeElement.classList.contains('footer-admin-entry')`));
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await wait(30);assert(await evaluate(`document.querySelector('#storefrontAdminDialog').open`),'Keyboard activation still opens modal');await evaluate(`document.querySelector('.storefront-admin-close').click()`);await wait(30);
      assert(await evaluate(`(()=>{const b=document.querySelector('.footer-admin-entry'),s=getComputedStyle(b);return document.activeElement===b&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.color==='rgba(0, 0, 0, 0)'&&s.outlineStyle==='none'&&s.boxShadow==='none'&&s.borderTopWidth==='0px'&&getComputedStyle(b,'::after').content==='none'})()`),'Focused entry stays visually invisible');
      async function login(mode){await evaluate(`sessionStorage.setItem('fixture-mode',${JSON.stringify(mode)});document.querySelector('.footer-admin-entry').click();document.querySelector('#storefrontAdminEmail').value='fixture@example.test';document.querySelector('#storefrontAdminPassword').value='fixture-only';document.querySelector('.storefront-admin-form').requestSubmit()`);assert(await evaluate(`document.querySelector('.storefront-admin-submit').disabled`));await wait(300);}
      await login('invalid');assert(await evaluate(`location.pathname==='/index.html'&&document.querySelector('.storefront-admin-message').textContent.includes('Incorrect')`));
      await evaluate(`document.querySelector('.storefront-admin-close').click()`);await wait(20);await login('customer');assert(await evaluate(`location.pathname==='/index.html'&&document.querySelector('.storefront-admin-message').textContent.includes('does not have')`));
      await evaluate(`document.querySelector('.storefront-admin-close').click()`);await wait(20);await login('rpc-error');assert(await evaluate(`document.querySelector('.storefront-admin-message').textContent.includes('could not be verified')`));
      await evaluate(`document.querySelector('.storefront-admin-close').click()`);await wait(20);await login('admin');await loaded('/admin.html');await wait(200);assert(await evaluate(`!document.querySelector('#adminPanel').hidden&&window.movioAdminAuthorized===true`));
      assert.equal(await evaluate(`localStorage.getItem('movio-cart')`),'[{"id":"kept","quantity":2}]');
      await evaluate(`sessionStorage.removeItem('fixture-session');sessionStorage.setItem('fixture-mode','customer')`);await send('Page.navigate',{url:base+'/admin.html'});await loaded('/admin.html');await wait(150);assert(await evaluate(`document.querySelector('#adminPanel').hidden&&window.movioAdminAuthorized===false`));
      await evaluate(`sessionStorage.setItem('fixture-mode','invalid');document.querySelector('#adminEmail').value='fixture@example.test';document.querySelector('#adminPassword').value='wrong-fixture';document.querySelector('#adminLoginForm').requestSubmit()`);await wait(200);assert(await evaluate(`document.querySelector('#adminPanel').hidden&&window.movioAdminAuthorized===false`));
      await evaluate(`sessionStorage.setItem('fixture-session','present')`);await send('Page.navigate',{url:base+'/admin.html'});await loaded('/admin.html');await wait(150);assert(await evaluate(`document.querySelector('#adminPanel').hidden&&window.movioAdminAuthorized===false`));
      console.log('PASS '+width+'px: seven footer entries, invisible entry with keyboard activation, no overlap/overflow, dialog focus/Escape, loading, wrong credentials/customer/RPC denied, allowed admin redirects, direct URL gated, cart preserved (mock Auth)');
    }
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
