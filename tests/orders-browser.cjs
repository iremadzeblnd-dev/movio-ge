// Run with: node tests/orders-browser.cjs
// Real checkout/history UI with local mocked Auth, Turnstile and order endpoints.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const homepage = false;
const live = false;
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-quantity-'));
let mode='success';const requests=[];const receipts=new Map();
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'cart.html';
  if (name === 'supabase-sync.js') { res.end('// Isolated test fixture only; production never reads cached catalogs.\nwindow.MovioStore.setCatalog(JSON.parse(localStorage.getItem(\'movio-data-v1\')||\'{"products":[]}\').products);window.MovioStore.catalogReady=Promise.resolve();'); return; }
  if (name === 'supabaseClient.js') { res.end(`
    window.__user=null;window.__history=[];window.__historyFail=false;
    window.movioSupabase={rpc:async(name,args)=>{await new Promise(r=>setTimeout(r,window.__adminDelay||0));if(name==='movio_is_admin')return {data:window.__user?.id==='admin-test'};if(window.__user?.id!=='admin-test')return {error:{message:'ADMIN_REQUIRED'}};if(window.__ordersFail)return {error:{message:'failed'}};if(name==='movio_admin_orders')return {data:args.p_offset?[]:(window.__adminOrders||[])};if(name==='movio_admin_order_status'){window.__statusRequests=(window.__statusRequests||[]).concat([args]);window.__adminOrders.find(o=>o.id===args.p_order_id).status=args.p_status;return {data:{id:args.p_order_id,status:args.p_status}};}throw Error('Unexpected RPC');},auth:{signOut:async()=>{window.__user=null;window.__authCallback('SIGNED_OUT',null);return {}},getSession:async()=>({data:{session:window.__user?{user:window.__user,access_token:'test-auth-token'}:null}}),onAuthStateChange:callback=>{window.__authCallback=callback;}},
      from:()=>({select:()=>({eq:(key,id)=>{window.__historyUser=id;return {order:()=>({limit:async()=>window.__historyFail?{error:{message:'fail'}}:{data:window.__history}})};}})})};
    window.turnstile={render:()=>0,getResponse:()=>window.__captcha===false?'':'test-captcha',reset:()=>{}};
  `); return; }
  if (name === 'api/orders') {
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET'){res.end(JSON.stringify({siteKey:'test-key',deliveryRule:'weight_tariff_v1'}));return;}
    let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
      const body=JSON.parse(raw);requests.push({body,authorization:req.headers.authorization});
      setTimeout(()=>{
        if(mode==='drop'){res.destroy();return;}
        if(/^reject-\d+$/.test(mode)){res.statusCode=Number(mode.slice(7));res.end(JSON.stringify({error:'Retry rejected'}));return;}
        if(mode==='fail'){res.statusCode=409;res.end(JSON.stringify({error:'Stock changed'}));return;}
        if(mode==='malformed'){res.end(JSON.stringify({id:'bad',number:'MOVIO-100999',subtotal:25.5,deliveryCost:0,total:-1}));return;}
        let receipt=receipts.get(body.checkoutToken);
        if(!receipt){const subtotal=body.items.reduce((sum,item)=>sum+item.expectedPrice*item.quantity,0);const shipping=require('../shipping.js').quote(body.items.map(i=>({product:{weightKg:i.expectedWeightKg,freeDelivery:i.expectedFreeDelivery},quantity:i.quantity})),body.deliveryType);const deliveryCost=shipping.deliveryCost;receipt={id:body.checkoutToken,number:'MOVIO-'+(100000+receipts.size),subtotal,deliveryCost,total:subtotal+deliveryCost};receipts.set(body.checkoutToken,receipt);}
        if(mode==='commit-drop'){res.destroy();return;}
        if(mode==='commit-503'){res.statusCode=503;res.end(JSON.stringify({error:'Uncertain upstream response'}));return;}
        if(mode==='commit-malformed'){res.end('{broken');return;}
        res.end(JSON.stringify(receipt));
      },100);
    });return;
  }
  try {
    let data = fs.readFileSync(path.join(root, name));
    if (name.endsWith('.html')) data = data.toString().replace(/<script src="https:[^>]*><\/script>/g, '').replace(/<link\b[^>]*>/g, tag => tag.includes('https:') ? '' : tag);
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
    const position = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control');el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (mobile) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...position });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...position });
    }
  }
  async function wait(expression) {
    for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,30));}
    throw Error('Timeout: '+expression+' '+JSON.stringify({errors,page:await evaluate(`({url:location.href,state:document.readyState,products:window.MovioStore?.getProducts(),message:document.querySelector('#checkoutMessage')?.textContent,retry:document.getElementById('retryPendingCheckout')?.outerHTML,user:window.__user,pending:JSON.parse(sessionStorage.getItem('movio-pending-checkout')||'null'),scripts:[...document.scripts].map(s=>s.src)})`)}));
  }
  async function setup(weight=45,free=false,quantity=1,type='city') {
    await evaluate(`sessionStorage.clear();localStorage.setItem('movio-data-v1',JSON.stringify({products:[{id:'a',name:'Original product',price:25.5,weightKg:${weight},freeDelivery:${free},stock:100,active:true,category:'electric-scooters'}],orders:[]}));localStorage.setItem('movio-cart',JSON.stringify([{id:'a',quantity:${quantity}}]));`);
    await reload();
    assert.equal(await evaluate(`document.querySelector('#deliveryType').value`),'','No silently chosen delivery type');
    assert.equal(await evaluate(`document.querySelector('#desktopCartCheckout').disabled`),false,'Delivery validation must allow a click to explain the block');
    await click(currentCheckoutWidth < 600 ? '#mobileCartCheckout' : '#desktopCartCheckout');
    if (!free) {
      assert(await evaluate(`document.querySelector('#checkoutForm').hidden && document.querySelector('#checkoutMessage').textContent.length>0`),'Blocked click explains why checkout cannot continue');
      await evaluate(`document.querySelector('#deliveryType').value=${JSON.stringify(type)};document.querySelector('#deliveryType').dispatchEvent(new Event('change'))`);
    }
    await click(currentCheckoutWidth < 600 ? '#mobileCartCheckout' : '#desktopCartCheckout');
    await evaluate(`const f=document.querySelector('#checkoutForm');f.elements.name.value='First Last';f.elements.phone.value='+995555123456';f.elements.city.value='Tbilisi';f.elements.address.value='Street 1';`);
  }
  let currentCheckoutWidth = 1280;
  for(const width of [1280,390,320]){
    currentCheckoutWidth = width;
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    for(const [weight,type,cost] of [[1,'city',6.5],[5,'region',12.5],[10,'branch_pickup',10],[15,'village_highland',26],[45,'city',45]]){
      await setup(weight,false,1,type);
      assert.equal(await evaluate(`document.querySelector('#checkoutForm').hidden`),false,'Actual checkout button opens valid form');
      assert(await evaluate(`!document.querySelector('#deliveryTypeField').hidden && document.querySelector('#deliveryType').required && document.querySelector('#deliveryTypeField').getBoundingClientRect().bottom <= document.querySelector('[data-cart-subtotal]').getBoundingClientRect().top`),'Paid selector appears above all prices');
      assert.equal(await evaluate(`document.querySelector('#deliveryCost').textContent`),await evaluate(`formatPrice(${cost})`));
      assert.equal(await evaluate(`document.querySelector('[data-cart-total]').textContent`),await evaluate(`formatPrice(${cost}+25.5)`));
    }
    await setup(45,false,2);
    assert.equal(await evaluate(`document.querySelector('#cartWeight').textContent`),'90 კგ');
    assert.equal(await evaluate(`document.querySelector('#deliveryCost').textContent`),await evaluate(`formatPrice(65)`));
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'No horizontal page overflow');
    mode='fail';await evaluate(`placeCartOrder('cash_on_delivery')`);assert.equal(await evaluate(`cartStore.itemCount`),2);
    mode='malformed';await evaluate(`placeCartOrder('cash_on_delivery')`);assert.equal(await evaluate(`cartStore.itemCount`),2,'Malformed receipt never clears cart');
    const malformedToken=requests.at(-1).body.checkoutToken;
    mode='drop';await evaluate(`placeCartOrder('cash_on_delivery')`);const token=requests.at(-1).body.checkoutToken;
    assert.equal(token,malformedToken,'Uncertain receipt retains retry token');
    mode='success';await evaluate(`document.querySelector('#checkoutForm').requestSubmit();document.querySelector('#checkoutForm').requestSubmit()`);await wait(`!orderBusy`);
    assert.equal(requests.at(-1).body.checkoutToken,token);assert.equal(requests.at(-1).authorization,undefined);assert.equal(await evaluate(`cartStore.itemCount`),0);
    assert(await evaluate(`document.querySelector('#checkoutMessage').textContent.includes('MOVIO-')`));
    await setup(45,false,2);
    await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('movio-data-v1'));s.products.push({id:'b',name:'Second paid',price:10,weightKg:10,freeDelivery:false,stock:5,active:true});localStorage.setItem('movio-data-v1',JSON.stringify(s));MovioStore.setCatalog(s.products);cartStore.add('b');renderCart()})()`);
    assert.equal(await evaluate(`document.querySelector('#deliveryCost').textContent`),await evaluate(`formatPrice(65)`));
    assert.equal(await evaluate(`document.querySelector('[data-cart-total]').textContent`),await evaluate(`formatPrice(126)`));
    await evaluate(`document.querySelector('.cart-item[data-product-id="a"] [data-cart-action="increase"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#deliveryCost').textContent`),await evaluate(`formatPrice(80)`));
    await evaluate(`document.querySelector('.cart-item[data-product-id="a"] [data-cart-action="decrease"]').click();placeCartOrder('cash_on_delivery')`);
    assert.equal(await evaluate(`cartStore.itemCount`),0);
    await setup(45,true,2);assert.equal(await evaluate(`document.querySelector('[data-cart-total]').textContent`),await evaluate(`formatPrice(51)`));
    for (const type of ['city','region','branch_pickup','village_highland']) {
      await setup(null,true,2,type);
      assert(await evaluate(`!document.querySelector('#checkoutForm').hidden && getCartShippingQuote().deliveryCost===0 && document.querySelector('#checkoutDelivery').textContent==='მიწოდება — უფასო (0 ₾)' && document.querySelector('[data-cart-items]').textContent.includes('უფასო მიწოდება')`),'Free shipping opens checkout nationwide without weight');
      assert(await evaluate(`document.querySelector('#deliveryTypeField').hidden && getComputedStyle(document.querySelector('#deliveryTypeField')).display==='none' && document.querySelector('#deliveryType').disabled && !document.querySelector('#deliveryType').required`),'Free selector completely hidden and excluded from native validation');
      assert.equal(await evaluate(`document.querySelector('#deliveryCost').textContent`),'უფასო (0 ₾)');
    }
    const freeRequests = requests.length;
    await evaluate(`document.querySelector('#customerAddress').value='';document.querySelector('#checkoutForm').requestSubmit()`);
    assert.equal(requests.length,freeRequests,'Free orders still require address');
    await evaluate(`document.querySelector('#customerAddress').value='Regional address';placeCartOrder('cash_on_delivery')`);
    assert.equal(requests.at(-1).body.deliveryType,'city','Hidden free selector uses a server-valid fulfillment type');
    assert.equal(requests.at(-1).body.customer.address,'Regional address');
    assert.equal(requests.at(-1).body.items[0].expectedFreeDelivery,true);
    assert.equal(await evaluate(`cartStore.itemCount`),0,'Free checkout persists mocked receipt');
    await setup(45,true,2);
    await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('movio-data-v1'));s.products.push({id:'b',name:'Second free',price:10,weightKg:10,freeDelivery:true,stock:5,active:true});localStorage.setItem('movio-data-v1',JSON.stringify(s));MovioStore.setCatalog(s.products);cartStore.add('b');renderCart()})()`);
    assert(await evaluate(`getCartShippingQuote().ok && getCartShippingQuote().deliveryCost===0`));
    await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('movio-data-v1'));s.products[1].freeDelivery=false;localStorage.setItem('movio-data-v1',JSON.stringify(s));MovioStore.setCatalog(s.products);renderCart()})()`);
    assert(await evaluate(`!document.querySelector('#deliveryTypeField').hidden && !document.querySelector('#deliveryType').disabled && document.querySelector('#deliveryType').required && getCartShippingQuote().error==='DELIVERY_TYPE_REQUIRED'`),'Free-to-mixed transition requires explicit paid delivery choice');
    await evaluate(`document.querySelector('#deliveryType').value='city';document.querySelector('#deliveryType').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`getCartShippingQuote().chargeableWeightKg`),10);
    assert.equal(await evaluate(`getCartShippingQuote().totalWeightKg`),100);
    assert.equal(await evaluate(`getCartShippingQuote().deliveryCost`),11);
    await evaluate(`placeCartOrder('cash_on_delivery')`);assert.equal(await evaluate(`cartStore.itemCount`),0);
    await setup(null,false,2);
    assert(await evaluate(`document.querySelector('#checkoutForm').hidden && getCartShippingQuote().error==='PRODUCT_WEIGHT_REQUIRED' && document.querySelector('#checkoutMessage').textContent.includes('მონაცემები დასაზუსტებელია')`));
    assert.equal(await evaluate(`document.querySelector('#deliveryCost').textContent`),'დასაზუსტებელია');
    assert.equal(await evaluate(`cartStore.itemCount`),2,'Blocked checkout preserves quantities');
    await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('movio-data-v1'));s.products[0].weightKg=45;localStorage.setItem('movio-data-v1',JSON.stringify(s));MovioStore.setCatalog(s.products);renderCart()})()`);
    await click(width < 600 ? '#mobileCartCheckout' : '#desktopCartCheckout');
    assert(await evaluate(`!document.querySelector('#checkoutForm').hidden && document.querySelector('#checkoutMessage').textContent===''`),'Corrected data opens form and clears block');
    await setup(600,false,2);assert(await evaluate(`document.querySelector('#checkoutForm').hidden && getCartShippingQuote().error==='DELIVERY_CONFIRMATION_REQUIRED' && document.querySelector('#checkoutMessage').textContent.includes('1000')`));
    await setup(45,false,1);
    await evaluate(`window.__user={id:'11111111-1111-4111-8111-111111111111',email:'buyer@example.test',user_metadata:{first_name:'First',last_name:'Last'}};window.__authCallback('SIGNED_IN',{user:window.__user});placeCartOrder('cash_on_delivery')`);
    assert.equal(requests.at(-1).authorization,'Bearer test-auth-token');assert.equal(requests.at(-1).body.deliveryType,'city');assert(!('user_id' in requests.at(-1).body));
    await evaluate(`window.__history=[{id:'one',order_number:'MOVIO-100123',created_at:'2026-10-08T10:00:00Z',total:70.5,delivery_cost:45,delivery_type:'city',total_weight_kg:45,order_status:'received',payment_status:'pending',order_items:[{product_name:'Historical product',unit_price:25.5,quantity:1,line_total:25.5,weight_kg:45,free_delivery:false}]}];document.querySelector('#accountButton').click();document.querySelector('#accountMenu [data-account-action="orders"]').click()`);
    await wait(`!!document.querySelector('.customer-order')`);assert(await evaluate(`document.querySelector('#accountOrdersPanel').textContent.includes('Historical product')`));
    await evaluate(`window.__user=null;window.__authCallback('SIGNED_OUT',null);document.querySelector('#accountDialog').close()`);
    console.log(`PASS shipping checkout ${width}px: explicit type, tariff examples, combined/quantity weights, guest/auth, failed/success/retry flows, all-free, mixed paid-weight only, overweight-block, history snapshots`);
  }
  for(const host of ['localhost','127.0.0.1']){
    await send('Page.navigate',{url:`http://${host}:${server.address().port}/admin.html`});
    await wait(`document.readyState!=='loading' && !!window.__authCallback && !!window.MovioAdminUI`);
    assert(await evaluate(`document.querySelector('#adminPanel').hidden && getComputedStyle(document.querySelector('#adminPanel')).display==='none' && document.querySelector('#productsList').children.length===0`));
    console.log(`PASS logged-out ${host}: login only, dashboard hidden, no Admin rows rendered`);
  }
  for(const width of [1280,390]){
    await evaluate(`localStorage.setItem('movio-data-v1',JSON.stringify({products:[{id:'legacy',name:'Legacy',price:100,stock:3,active:true,image:'original.jpg',description:'Preserved'}],orders:[]}))`);
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/admin.html`});await wait(`document.readyState!=='loading' && typeof editProduct==='function' && !!window.__authCallback`);
    await evaluate(`window.__user={id:'customer-test'};window.__authCallback('SIGNED_IN',{user:window.__user})`);
    await wait(`document.querySelector('#loginMessage').textContent.includes('უფლება')`);
    assert(await evaluate(`document.querySelector('#adminPanel').hidden && window.movioAdminAuthorized===false && document.querySelector('#productsList').children.length===0`));
    await evaluate(`window.__adminDelay=100;window.__user={id:'admin-test'};window.__authCallback('SIGNED_IN',{user:window.__user})`);
    assert(await evaluate(`document.querySelector('#adminPanel').hidden && document.querySelector('#productsList').children.length===0`),'No dashboard data before authorization completes');
    await wait(`window.movioAdminAuthorized===true`);
    await evaluate(`window.__adminDelay=0;window.__adminOrders=[{id:'real-order',number:'MOVIO-100999',createdAt:'2026-10-08T10:00:00Z',name:'Real Buyer',phone:'+995555123456',email:'buyer@example.test',city:'Tbilisi',address:'Actual Street',subtotal:50,deliveryCost:6.5,total:56.5,paymentMethod:'cash_on_delivery',paymentStatus:'pending',status:'received',items:[{name:'Snapshot product',quantity:2,price:25}]}];document.querySelector('#refreshAdminOrders').click()`);
    await wait(`document.querySelector('#ordersList').textContent.includes('MOVIO-100999')`);
    assert(await evaluate(`document.querySelector('#ordersList').textContent.includes('Snapshot product × 2') && document.querySelector('#ordersList').textContent.includes('Actual Street') && document.querySelector('#ordersList').textContent.includes('pending')`));
    assert.equal(await evaluate(`document.querySelector('#metric-orders').textContent`),'1');
    await evaluate(`var statusControl=document.querySelector('#ordersList .status-select');statusControl.value='preparing';statusControl.dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait(`!ordersBusy && document.querySelector('#ordersList .status-select').value==='preparing'`);
    assert.deepEqual(await evaluate(`window.__statusRequests[0]`),{p_order_id:'real-order',p_status:'preparing'});
    await evaluate(`window.__ordersFail=true;document.querySelector('#refreshAdminOrders').click()`);
    await wait(`!ordersBusy && document.querySelector('#adminOrdersMessage').textContent.includes('ჩატვირთვა ვერ')`);
    assert.equal(await evaluate(`document.querySelector('#ordersList').children.length`),0,'Failed loads clear stale orders');
    await evaluate(`window.__ordersFail=false;document.querySelector('#refreshAdminOrders').click()`);
    await wait(`!ordersBusy && document.querySelector('#ordersList').children.length===1`);
    await evaluate(`var statusControl=document.querySelector('#ordersList .status-select');statusControl.value='cancelled';statusControl.dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait(`!ordersBusy && document.querySelector('#ordersList .status-select').disabled`);
    assert.equal(await evaluate(`document.querySelector('#ordersList .status-select').value`),'cancelled');
    console.log('PASS Admin real orders: RPC data, details/quantities/payment/delivery, metrics, persisted status, load failure/retry, terminal cancellation');
    await evaluate(`editProduct(window.MovioStore.getProducts()[0])`);
    assert.equal(await evaluate(`document.querySelector('#productWeightKg').value`),'','Legacy product remains editable');
    await evaluate(`document.querySelector('#productWeightKg').value='0'`);assert.equal(await evaluate(`document.querySelector('#productWeightKg').checkValidity()`),false);
    await evaluate(`document.querySelector('#productWeightKg').value='45.125';document.querySelector('#productFreeDelivery').checked=true;document.querySelector('#productForm').requestSubmit()`);
    await wait(`window.MovioStore.getProducts()[0].weightKg===45.125`);
    assert.deepEqual(await evaluate(`(()=>{const p=window.MovioStore.getProducts()[0];return [p.freeDelivery,p.price,p.stock,p.image,p.description]})()`),[true,100,3,'original.jpg','Preserved']);
    await evaluate(`document.querySelector('#newProductButton').click();const f=document.querySelector('#productForm');f.elements.name.value='New paid';f.elements.category.value='electric-scooters';f.elements.price.value='100';f.elements.stock.value='3';f.elements.weightKg.value='45';f.requestSubmit()`);
    await wait(`window.MovioStore.getProducts().some(p=>p.name==='New paid')`);const id=await evaluate(`window.MovioStore.getProducts().find(p=>p.name==='New paid').id`);
    await evaluate(`(()=>{document.querySelector('#newProductButton').click();const f=document.querySelector('#productForm');f.elements.name.value='Nationwide free';f.elements.category.value='electric-scooters';f.elements.price.value='80';f.elements.stock.value='3';document.querySelector('#productFreeDelivery').click();f.requestSubmit()})()`);
    await wait(`window.MovioStore.getProducts().some(p=>p.name==='Nationwide free')`);
    assert.deepEqual(await evaluate(`(()=>{const p=window.MovioStore.getProducts().find(p=>p.name==='Nationwide free');return [p.freeDelivery,p.weightKg,p.stock]})()`),[true,null,3]);
    await evaluate(`editProduct(window.MovioStore.getProducts().find(p=>p.name==='Nationwide free'));document.querySelector('#productFreeDelivery').click()`);
    assert(await evaluate(`document.querySelector('#productWeightKg').required && !document.querySelector('#productWeightKg').checkValidity()`),'Turning free shipping off requires paid-delivery weight');
    assert(await evaluate(`document.querySelector('#adminPanel [data-admin-logout]').click();document.querySelector('#adminPanel').hidden && document.querySelector('#productsList').children.length===0 && window.movioAdminAuthorized===false`),'Logout hides and clears dashboard immediately');
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/item.html?item=${encodeURIComponent(id)}`});await wait(`!!document.querySelector('#detailDeliveryPrice')`);
    assert(await evaluate(`document.querySelector('#detailDeliveryPrice').textContent.includes('45')`));
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/item.html?item=legacy`});await wait(`!!document.querySelector('#detailDeliveryPrice')`);
    assert.equal(await evaluate(`document.querySelector('#detailDeliveryPrice').textContent`),'უფასო მიწოდება');
    console.log(`PASS Admin/detail ${width}px: legacy edit, invalid zero, weight/free save, preserved price/stock/image, paid create and free/weight labels`);
  }
  for (const width of [1280,390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
    await wait(`document.readyState!=='loading' && typeof applyCatalogFilter==='function'`);
    await evaluate(`applyCatalogFilter('electric-scooters')`);
    assert(await evaluate(`[...document.querySelectorAll('#catalog .category-detail:not([hidden])')].length>0`));
    await evaluate(`document.querySelector('.footer-column [data-category-filter=""]').click()`);
    assert.equal(await evaluate(`activeCategoryFilter`),'','All-products link clears previous category');
    await evaluate(`document.querySelector('#site-search').value='New paid';document.querySelector('#site-search').dispatchEvent(new Event('input'))`);
    assert(await evaluate(`document.querySelector('.search-results').textContent.includes('New paid')`));
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'Homepage has no horizontal overflow');
    for(const page of ['delivery','contact','privacy','returns','terms']) {
      await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${page}.html`});
      await wait(`document.readyState!=='loading' && !!document.querySelector('.information-page')`);
      assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),page+' responsive');
    }
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/electric-scooters.html`});
    await wait(`location.pathname.endsWith('/index.html') && typeof applyCatalogFilter==='function' && activeCategoryFilter==='electric-scooters'`);
    console.log('PASS storefront '+width+'px: search, category/all-products filtering, category redirect, information pages and responsive widths');
  }
  await evaluate(`localStorage.setItem('movio-data-v1',JSON.stringify({products:[{id:'flow',name:'Flow product',category:'electric-scooters',price:35,stock:5,stockStatus:'მარაგშია',freeDelivery:true,weightKg:null,active:true}],orders:[]}));localStorage.setItem('movio-cart','[]')`);
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/item.html?item=flow`});
  await wait(`!!document.querySelector('#detailBuy') && !document.querySelector('#detailBuy').disabled`);
  await click('#detailBuy');
  await wait(`location.pathname.endsWith('/cart.html') && typeof cartStore!=='undefined' && cartStore.itemCount===1`);
  await click('#mobileCartCheckout');
  await evaluate(`(()=>{const f=document.querySelector('#checkoutForm');f.elements.name.value='Guest Buyer';f.elements.phone.value='+995555123456';f.elements.city.value='Kutaisi';f.elements.address.value='Flow street';f.requestSubmit()})()`);
  await wait(`!orderBusy && document.querySelector('#checkoutMessage').classList.contains('checkout-success')`);
  assert.equal(await evaluate(`cartStore.itemCount`),0);
  assert.equal(requests.at(-1).body.deliveryType,'city');assert.equal(requests.at(-1).authorization,undefined);
  assert.equal(requests.at(-1).body.customer.city,'Kutaisi');
  console.log('PASS complete mocked product → cart → guest checkout → confirmation flow, nationwide free shipping, cart cleared only after receipt');
  for (const uncertainMode of ['commit-drop','commit-503','commit-malformed']) {
  await setup(1,true,1);
  mode=uncertainMode;
  await evaluate(`placeCartOrder('cash_on_delivery')`);
  const recoveryToken=requests.at(-1).body.checkoutToken, receiptCount=receipts.size;
  assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('movio-pending-checkout')).token`),recoveryToken,'Uncertain response preserves original token');
  const originalPayload=JSON.stringify(requests.at(-1).body);
  const requestCount=requests.length;
  await evaluate(`document.querySelector('#checkoutForm').elements.address.value='Changed address';placeCartOrder('cash_on_delivery')`);
  assert.equal(requests.length,requestCount,'Changed checkout cannot replace an unresolved order');
  assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('movio-pending-checkout')).token`),recoveryToken);
  for (const status of [401,403,409]) {
    mode='reject-'+status;
    await click('#retryPendingCheckout');await wait(`!orderBusy`);
    assert.equal(requests.at(-1).body.checkoutToken,recoveryToken,'Rejected retry retains original token');
    assert.equal(JSON.stringify(requests.at(-1).body),originalPayload,'Rejected retry retains original payload');
    assert(await evaluate(`JSON.parse(sessionStorage.getItem('movio-pending-checkout')).outcomeUncertain===true`));
    await reload();
    assert(await evaluate(`!document.getElementById('retryPendingCheckout').hidden`),'Recovery survives rejected retry and reload');
  }
  await evaluate(`MovioStore.setCatalog([]);cartStore.items=cartStore.load();renderCart()`);
  await reload();
  assert.equal(await evaluate(`cartStore.itemCount`),0,'Unavailable products are excluded');
  assert(await evaluate(`!document.getElementById('retryPendingCheckout').hidden`),'Uncertain receipt can be recovered after reload');
  mode='success';
  const requestsBeforeRecovery=requests.length;
  await evaluate(`window.__user={id:'different-customer'}`);await click('#retryPendingCheckout');await wait(`!orderBusy`);
  assert.equal(requests.length,requestsBeforeRecovery,'Recovery cannot change order ownership');
  assert(await evaluate(`!!sessionStorage.getItem('movio-pending-checkout')`));
  await evaluate(`window.__user=null`);await click('#retryPendingCheckout');await wait(`!orderBusy && document.querySelector('#checkoutMessage').classList.contains('checkout-success')`);
  assert.equal(requests.at(-1).body.checkoutToken,recoveryToken);
  assert.equal(receipts.size,receiptCount,'Recovery creates no duplicate after catalog deletion');
  assert.equal(await evaluate(`sessionStorage.getItem('movio-pending-checkout')`),null);
  console.log('PASS committed/lost response recovery after reload and unavailable product: original payload/token, one mocked receipt');
  }
  await setup(1,true,1);
  const beforeCorrupt=requests.length;
  await evaluate(`sessionStorage.setItem('movio-pending-checkout','{broken');placeCartOrder('cash_on_delivery')`);
  assert.equal(requests.length,beforeCorrupt,'Unreadable pending storage cannot generate a new order');
  assert.equal(await evaluate(`sessionStorage.getItem('movio-pending-checkout')`),'{broken');
  console.log('PASS changed form and unreadable pending storage block replacement checkout');
  assert.deepEqual(errors,[]);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ws?.close();chrome.kill();server.close()});
