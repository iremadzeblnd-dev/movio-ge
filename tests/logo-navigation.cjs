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
const customerPages = fs.readdirSync(root).filter(file => file.endsWith('.html') && /class="wordmark"/.test(fs.readFileSync(path.join(root, file), 'utf8')));
for (const page of customerPages) {
  const source = fs.readFileSync(path.join(root, page), 'utf8');
  assert(/src="logo-navigation\.js(?:\?[^\"]*)?"/.test(source), `${page} includes shared navigation`);
  assert(!/class="(?:wordmark|footer-brand-link)" href="index.html#/.test(source), `${page} has clean logo URL`);
}
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
    for (const width of [375, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const page of customerPages) {
        await send('Page.navigate', { url: `${base}/${page}?category=electric-bikes&search=fixture${page === 'item.html' ? '&item=logo-fixture-0' : ''}#catalog` });
        await loaded(`/${page}`);
        await evaluate(`(()=>{
          localStorage.setItem('movio-cart',JSON.stringify([{id:'logo-fixture-0',quantity:1}]));
          localStorage.setItem('sb-fixture-auth-token','preserved-session');
          if(typeof applyCatalogFilter==='function')applyCatalogFilter('electric-bikes');
          const input=document.querySelector('#site-search');if(input){input.value='Fixture';input.dispatchEvent(new Event('input',{bubbles:true}));}
          window.scrollTo(0,document.body.scrollHeight);
          document.querySelector('.wordmark img').click();
        })()`);
        await loaded('/index.html');
        await wait(75);
        const state = await evaluate(`({url:location.pathname+location.search+location.hash,query:document.querySelector('#site-search').value,active:activeCategoryFilter,selected:document.querySelectorAll('.category-active').length,cards:[...document.querySelectorAll('.managed-product')].map(card=>card.hidden),resultsHidden:document.querySelector('.search-results').hidden,scroll:scrollY,cart:JSON.parse(localStorage.getItem('movio-cart')),auth:localStorage.getItem('sb-fixture-auth-token')})`);
        assert.equal(state.url, '/index.html', `${page} clean homepage URL`);
        assert.equal(state.query, ''); assert.equal(state.active, ''); assert.equal(state.selected, 0);
        assert.equal(state.cards.length, products.length); assert(state.cards.every(hidden => !hidden));
        assert(state.resultsHidden); assert.equal(state.scroll, 0, `${page}: logo scroll reset`);
        assert.deepEqual(state.cart, [{ id: 'logo-fixture-0', quantity: 1 }]); assert.equal(state.auth, 'preserved-session');
      }
      // Same clean homepage URL with filters applied only in memory; test footer logo too.
      await evaluate(`applyCatalogFilter('quad-bikes');document.querySelector('#site-search').value='Fixture';window.scrollTo(0,document.body.scrollHeight);document.querySelector('.footer-brand-link img').click();`);
      await loaded('/index.html'); await wait(75);
      assert(await evaluate(`activeCategoryFilter===''&&document.querySelector('#site-search').value===''&&scrollY===0&&[...document.querySelectorAll('.managed-product')].every(card=>!card.hidden)`), 'Same-page footer logo resets filters and scroll');
      console.log(`PASS logo navigation at ${width}px: ${customerPages.length} customer pages, category/query/hash reset, all products, header/footer logos, top scroll, cart/Auth storage preserved`);
    }
  } finally { ws?.close(); chrome.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
