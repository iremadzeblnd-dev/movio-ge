const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const products = ['electric-scooters', 'electric-bikes', 'quad-bikes', 'car-accessories'].map((category, index) => ({
  id: `logo-fixture-${index}`, name: `Logo fixture ${index}`, category, category_key: category,
  price: 100, old_price: 150, old_price_visible: true, stock: 3, active: true, free_delivery: true,
}));
const server = http.createServer((request, response) => {
  const filename = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (filename === 'supabaseClient.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`window.movioSupabase={from:()=>({select:()=>({order:async()=>({data:${JSON.stringify(products)}})})}),auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`);
    return;
  }
  try {
    let body = fs.readFileSync(path.join(root, filename));
    if (filename.endsWith('.html')) body = body.toString().replace(/<script src="https:[^>]*><\/script>/g, '')
      .replace(/<link\b[^>]*href="https:[^>]*>/g, '');
    response.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/css');
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = process.argv.includes('--live') ? 'http://127.0.0.1:4173' : `http://127.0.0.1:${server.address().port}`;
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
      for (let index = 0; index < 400; index++) {
        try {
          if (await evaluate(`location.pathname===${JSON.stringify(pathname)}&&document.readyState==='complete'&&(!window.MovioStore||MovioStore.getCatalogStatus()==='ready')`)) return;
        } catch { /* Navigation replaces the execution context. */ }
        await wait(50);
      }
      throw Error(`Timed out loading ${pathname}: ${JSON.stringify(await evaluate(`({url:location.href,state:document.readyState,catalog:window.MovioStore?.getCatalogStatus()})`))}`);
    };
    await send('Page.enable'); await send('Runtime.enable');
    const errors = [], network = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a=>a.value||a.description).join(' '));
      if (msg.method === 'Network.responseReceived' && /products|supabaseClient|script\.js|store\.js/.test(msg.params.response.url)) network.push({url:msg.params.response.url,status:msg.params.response.status,cache:msg.params.response.fromDiskCache});
    });
    await send('Network.enable');
    const visible = async label => {
      const state = await evaluate(`({url:location.href,status:MovioStore.getCatalogStatus(),products:MovioStore.getProducts().filter(p=>p.active!==false).length,cards:document.querySelectorAll('.managed-product').length,visible:[...document.querySelectorAll('.managed-product')].filter(p=>!p.hidden).length,message:document.querySelector('#catalogSyncMessage')?.textContent,filter:typeof activeCategoryFilter==='undefined'?null:activeCategoryFilter})`);
      console.log(label+' '+JSON.stringify(state));
      assert(state.products > 0 && state.cards === state.products && state.visible > 0, label+': '+JSON.stringify({state,errors,network}));
    };
    for (const width of [375, 1280]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      await send('Page.navigate',{url:base+'/index.html'}); await loaded('/index.html'); await visible('initial');
      for (const category of ['electric-bikes', 'quad-bikes', 'car-accessories', '']) {
        await evaluate(`document.querySelector('[data-category-filter="${category}"]').click()`);
        const state = await evaluate(`({filter:activeCategoryFilter,url:new URLSearchParams(location.search).get('category')||'',visible:[...document.querySelectorAll('.managed-product')].filter(c=>!c.hidden).map(c=>c.dataset.productCategory),expected:MovioStore.getProducts().filter(p=>p.active!==false&&(!activeCategoryFilter||MovioStore.getCategoryKey(p)===activeCategoryFilter)).length})`);
        assert.equal(state.filter, category); assert.equal(state.url, category); assert.equal(state.visible.length, state.expected);
        if(category) assert(state.visible.every(key=>key===category));
      }
      await evaluate('history.back()'); await wait(150);
      assert.equal(await evaluate('activeCategoryFilter'), 'car-accessories', 'Back restores previous category');
      await evaluate('history.forward()'); await wait(150);
      assert.equal(await evaluate('activeCategoryFilter'), '', 'Forward restores All Products');
      // Restored documents must rebuild cards from their confirmed in-memory catalog.
      await evaluate(`document.querySelector('[data-managed-products]').replaceChildren();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));`);
      await visible('restored document');
      if (!process.argv.includes('--live')) {
        await evaluate(`window.navigationMarker='same document';MovioStore.setCatalog([],'error');document.querySelector('.wordmark').click()`);
        await loaded('/index.html'); await visible('logo retries failed catalog');
        assert.equal(await evaluate('window.navigationMarker'), 'same document', 'Logo recovery must not replace the document');
      }
      for(let i=0;i<3;i++) {
        await evaluate(`document.querySelector('.managed-product h3 a, .managed-product a[href*="item.html"]').click()`); await loaded('/item.html');
        await evaluate(`document.querySelector('.wordmark').click()`); await loaded('/index.html'); await visible('logo return '+i);
        await evaluate(`document.querySelector('[data-category-filter="electric-scooters"]').click()`); await visible('Scooter '+i);
        assert.equal(await evaluate(`new URLSearchParams(location.search).get('category')`), 'electric-scooters', 'Selected category must survive navigation and refresh rather than exist only in memory');
        await evaluate(`document.querySelector('.managed-product a[href*="item.html"]').click()`); await loaded('/item.html');
        await evaluate('history.back()'); await loaded('/index.html'); await visible('back '+i);
        await evaluate('history.forward()'); await loaded('/item.html');
        await evaluate('history.back()'); await loaded('/index.html'); await visible('back again '+i);
        await send('Page.reload'); await loaded('/index.html'); await visible('reload '+i);
      }
      assert.equal(errors.length,0,JSON.stringify(errors));
      console.log('PASS repeated product/logo/category/back/forward/reload at '+width);
    }
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
