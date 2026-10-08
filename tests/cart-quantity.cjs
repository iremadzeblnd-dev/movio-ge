// Run with: node tests/cart-quantity.cjs
// Uses headless Chrome and isolated local product data; no live orders or database writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const homepage = process.argv.includes('--homepage');
const live = process.argv.includes('--live') || homepage;
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-quantity-'));
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'cart.html';
  if (name === 'supabase-sync.js') { res.end('// Isolated test fixture only; production never reads cached catalogs.\nwindow.MovioStore.setCatalog(JSON.parse(localStorage.getItem(\'movio-data-v1\')||\'{"products":[]}\').products);window.MovioStore.catalogReady=Promise.resolve();'); return; }
  if (name === 'supabaseClient.js') { res.end('window.movioSupabase = null;'); return; }
  try {
    let data = fs.readFileSync(path.join(root, name));
    if (name.endsWith('.html')) data = data.toString().replace(/<script src="https:[^>]*><\/script>/g, '').replace(/<link[\s\S]*?\/>/g, tag => tag.includes('https:') ? '' : tag);
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
const browser = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { stdio: 'ignore', windowsHide: true });
let ws;
async function main() {
  if (!live) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert(port, 'Headless Chrome must start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      message.error ? waiter.reject(message.error) : waiter.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: homepage ? 'http://127.0.0.1:5500/index.html' : live ? 'http://127.0.0.1:5500/cart.html' : `http://127.0.0.1:${server.address().port}/cart.html` });
  async function ready() {
    for (let i = 0; i < (live ? 500 : 100); i++) {
      if (await evaluate(`typeof cartStore !== 'undefined' && document.readyState !== 'loading'`)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Page did not initialize: ${JSON.stringify({errors, page: await evaluate("({url:location.href,state:document.readyState,cart:typeof cartStore,scripts:[...document.scripts].map(s=>s.src)})")})}`);
  }
  await ready();
  async function reload() {
    await evaluate(`window.__quantityTestReload = true`);
    await send('Page.reload');
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!window.__quantityTestReload && typeof cartStore !== 'undefined' && document.readyState !== 'loading'`)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Cart did not reload');
  }
  async function click(selector, mobile) {
    const position = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (mobile) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...position });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...position });
    }
  }
  async function check(quantity) {
    const actual = await evaluate(`(()=>{const row=document.querySelector('.cart-item[data-product-id="42"]');return {quantity:row?.querySelector('output').textContent,itemTotal:row?.querySelector('.cart-item-price').textContent,total:document.querySelector('[data-cart-total]').textContent,mobileTotal:document.querySelector('#mobileCartTotal').textContent,stored:JSON.parse(localStorage.getItem('movio-cart')).find(item=>String(item.id)==='42')?.quantity};})()`);
    assert.equal(actual.quantity, String(quantity));
    assert.equal(actual.itemTotal, await evaluate(`formatPrice(${quantity} * 25.5)`));
    assert.equal(actual.total, await evaluate(`formatPrice(${quantity} * 25.5 + 10)`));
    assert.equal(actual.mobileTotal, actual.total);
    assert.equal(actual.stored, quantity);
  }
  if (homepage) {
    for (const width of [1280, 390]) {
      const mobile = width <= 600;
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      await send('Page.navigate', { url: 'http://127.0.0.1:5500/index.html' });
      for (let i = 0; i < 200; i++) {
        if (await evaluate(`typeof cartStore !== 'undefined' && !!document.querySelector('.product-cart') && document.readyState === 'complete'`)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert(await evaluate(`!document.querySelector('#cart,#checkoutForm,#customerName,.hero,.promise,.faq') && document.querySelectorAll('footer').length===1 && !!document.querySelector('#categories')`));
      assert.equal(await evaluate(`document.querySelector('.header-cart-link').getAttribute('href')`), 'cart.html');
      await evaluate(`document.querySelector('#site-search').focus()`);
      const query = await evaluate(`window.MovioStore.getProducts()[0].name.slice(0,4)`);
      await send('Input.insertText', { text: query });
      assert(await evaluate(`!document.querySelector('.search-results').hidden && !!document.querySelector('.search-results a')`));
      await evaluate(`document.querySelector('#site-search').value='';document.querySelector('#site-search').dispatchEvent(new Event('input',{bubbles:true}));cartStore.clear();renderCart()`);
      await click('.transport-category-card[data-category-filter="electric-scooters"]', mobile);
      assert(await evaluate(`!!document.querySelector('.product-cart') && !document.querySelector('.compact-product-card').hidden`));
      await click('.product-cart', mobile);
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`location.pathname==='/cart.html' && document.readyState==='complete' && !!document.querySelector('.cart-item')`)) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert(await evaluate(`location.pathname==='/cart.html' && !!document.querySelector('.cart-item') && !!document.querySelector('#checkoutForm')`));
      await send('Page.navigate', { url: 'http://127.0.0.1:5500/index.html' });
      await ready();
      await click('.header-cart-link', mobile);
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`location.pathname==='/cart.html' && document.readyState==='complete'`)) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(await evaluate(`location.pathname`), '/cart.html');
      console.log(`PASS REAL HOMEPAGE ${width}px: clean sections, one footer, search, categories, unchanged product add action, cart icon, checkout on cart.html`);
    }
    assert.deepEqual(errors, []);
    return;
  }
  if (live) {
    // Real port-5500 page and unmodified scripts. Only GET stock data is varied
    // inside this isolated browser so stock-3 sequences do not modify the database.
    for (let i = 0; i < 200; i++) {
      if (await evaluate(`window.MovioStore.getProducts().length > 0`)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('REAL PAGE', await evaluate(`({url:location.href,stock:window.MovioStore.getProducts()[0]?.stock,containerListeners:getEventListeners(cartSection).click.length,oldListListeners:getEventListeners(cartItems).click?.length||0,script:[...document.scripts].find(s=>s.src.includes('/script.js'))?.src})`));
    assert.equal(await evaluate(`getEventListeners(cartSection).click.length`), 1);
    assert.equal(await evaluate(`getEventListeners(cartItems).click?.length||0`), 0);
    const fixtureErrors = [];
    ws.addEventListener('message', async event => {
      const message = JSON.parse(event.data);
      if (message.method !== 'Fetch.requestPaused') return;
      const response = message.params;
      try {
        if (response.responseStatusCode === 200 && response.request.method === 'GET') {
          const result = await send('Fetch.getResponseBody', { requestId: response.requestId });
          const products = JSON.parse(result.base64Encoded ? Buffer.from(result.body, 'base64').toString() : result.body);
          products.forEach(product => { product.stock = 3; });
          await send('Fetch.fulfillRequest', { requestId: response.requestId, responseCode: 200, responseHeaders: response.responseHeaders.filter(header => !['content-length', 'content-encoding'].includes(header.name.toLowerCase())), body: Buffer.from(JSON.stringify(products)).toString('base64') });
        } else await send('Fetch.continueRequest', { requestId: response.requestId });
      } catch (error) { fixtureErrors.push(error); }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*supabase.co/rest/v1/products*', requestStage: 'Response' }] });
    await send('Page.reload');
    for (let i = 0; i < 200; i++) {
      if (await evaluate(`typeof cartStore !== 'undefined' && window.MovioStore.getProducts()[0]?.stock === 3 && document.readyState === 'complete'`)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(await evaluate(`window.MovioStore.getProducts()[0].stock`), 3);
    await evaluate(`cartStore.clear();cartStore.add(window.MovioStore.getProducts()[0].id);renderCart()`);
    const liveCheck = async quantity => {
      const state = await evaluate(`(()=>{const row=document.querySelector('.cart-item');return {url:location.href,quantity:row.querySelector('output').textContent,item:row.querySelector('.cart-item-price').textContent,total:document.querySelector('[data-cart-total]').textContent,mobile:document.querySelector('#mobileCartTotal').textContent,stored:JSON.parse(localStorage.getItem('movio-cart'))[0],expected:formatPrice(${quantity}*window.MovioStore.getProducts()[0].price)};})()`);
      assert.equal(state.url, 'http://127.0.0.1:5500/cart.html');
      assert.equal(state.quantity, String(quantity));
      assert.equal(state.stored.quantity, quantity);
      assert.equal(typeof state.stored.id, 'string');
      assert.equal(state.item, state.expected); assert.equal(state.total, state.expected); assert.equal(state.mobile, state.expected);
    };
    for (const width of [1280, 390, 320]) {
      const mobile = width <= 600;
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      await liveCheck(1);
      await click('[data-cart-action="increase"]', mobile); await liveCheck(2);
      await click('[data-cart-action="increase"]', mobile); await liveCheck(3);
      assert(await evaluate(`document.querySelector('[data-cart-action="increase"]').disabled`));
      await reload(); await liveCheck(3);
      await click('[data-cart-action="decrease"]', mobile); await liveCheck(2);
      await click('[data-cart-action="decrease"]', mobile); await liveCheck(1);
      assert(await evaluate(`document.querySelector('[data-cart-action="decrease"]').disabled`));
      await reload(); await liveCheck(1);
      console.log(`PASS REAL PAGE ${width}px: physical clicks/taps 1→2→3 and 3→2→1, immediate totals, string IDs, refresh persistence, dynamically rebuilt rows`);
    }
    await click('[data-cart-action="remove"] svg', true);
    assert.equal(await evaluate(`document.querySelectorAll('.cart-item').length`), 0);
    assert.equal(await evaluate(`localStorage.getItem('movio-cart')`), '[]');
    assert.equal(await evaluate(`document.querySelector('[data-cart-total]').textContent`), '0 ₾');
    await reload();
    assert.equal(await evaluate(`document.querySelectorAll('.cart-item').length`), 0);
    assert.deepEqual(fixtureErrors, []); assert.deepEqual(errors, []);
    console.log('PASS REAL PAGE trash and empty-cart persistence; catalog/database stock unchanged');
    return;
  }
  const row = '.cart-item[data-product-id="42"]';
  for (const width of [1280, 768, 601, 600, 390, 320]) {
    const mobile = width <= 600;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
    for (const [productId, cartId, quantity] of [[42, '42', '1'], ['42', 42, 1], ['42', '42', 1]]) {
      await evaluate(`localStorage.setItem('movio-data-v1',JSON.stringify({products:[{id:${JSON.stringify(productId)},name:'ტესტის სკუტერი',category:'electric-scooters',price:25.5,weightKg:1,freeDelivery:true,stock:3,active:true},{id:'other',name:'მეორე პროდუქტი',category:'electric-scooters',price:10,weightKg:1,freeDelivery:true,stock:2,active:true}],orders:[]}));localStorage.setItem('movio-cart',JSON.stringify([{id:${JSON.stringify(cartId)},quantity:${JSON.stringify(quantity)}},{id:'other',quantity:1}]));`);
      await reload();
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row)}+' output')?.textContent`), '1', 'Mixed product/cart ID types must load');
      // Exercise lookup inside the click handler when the catalog changes ID type after rendering.
      await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('movio-data-v1'));data.products[0].id=${JSON.stringify(typeof productId === 'number' ? '42' : 42)};localStorage.setItem('movio-data-v1',JSON.stringify(data));MovioStore.setCatalog(data.products);})()`);
      await click(`${row} [data-cart-action="increase"]`, mobile); await check(2);
      await click(`${row} [data-cart-action="increase"]`, mobile); await check(3);
      await reload(); await check(3);
      assert(await evaluate(`document.querySelector(${JSON.stringify(row)}+' [data-cart-action="increase"]').disabled`));
      await evaluate(`cartStore.setQuantity('42',4);renderCart()`); await check(3);
      await click(`${row} [data-cart-action="decrease"]`, mobile); await check(2);
      await click(`${row} [data-cart-action="decrease"]`, mobile); await check(1);
      await reload(); await check(1);
      assert(await evaluate(`document.querySelector(${JSON.stringify(row)}+' [data-cart-action="decrease"]').disabled`));
      await evaluate(`cartStore.setQuantity(42,0);renderCart()`); await check(1);
      await click(`${row} [data-cart-action="remove"] svg`, mobile);
      assert.equal(await evaluate(`document.querySelectorAll('.cart-item').length`), 1);
      assert.equal(await evaluate(`document.querySelector('[data-cart-total]').textContent`), '10 ₾');
      await reload();
      assert.equal(await evaluate(`document.querySelectorAll('.cart-item').length`), 1);
      console.log(`PASS ${width}px, IDs ${typeof productId}/${typeof cartId}: 1→2→3, refresh, 3→2→1, totals, stock/minimum limits, trash`);
    }
  }
  assert.deepEqual(errors, [], 'No browser JavaScript exceptions');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome.kill(); server.close(); });
